import type { Capture, CaptureMode, SyncStatus } from "./types";
import {
  STORAGE_KEY,
  MAX_CAPTURES,
  MAX_CAPTURE_TEXT_LENGTH,
  MAX_NOTE_LENGTH,
  DEFAULT_CAPTURE_MODE,
  DEFAULT_SYNC_STATUS,
} from "./constants";
import { generateId } from "./id";

/**
 * Thin, typed abstraction over chrome.storage.local so the rest of the
 * codebase never calls the raw chrome.storage API directly. Centralizing
 * reads/writes here also means we only have to guard against malformed
 * or missing stored data (corrupt installs, future schema changes,
 * manual edits via chrome://extensions storage inspector) in one place.
 *
 * SCHEMA MIGRATION: captures saved by earlier versions of this extension
 * predate the `mode` / `syncStatus` / `remoteId` / `lastSyncAttempt` /
 * `syncError` fields. `normalizeCapture()` below fills sensible defaults
 * for anything missing (mode: "original", syncStatus: "local") without
 * touching `text`, `note`, or any other existing field, and without
 * ever dropping a capture just because it predates this schema. The
 * migration is applied lazily on every read; a capture is written back
 * in its migrated (current) shape the next time any write touches the
 * list, so no separate one-time migration pass is required.
 */

const CAPTURE_MODES: readonly CaptureMode[] = ["original", "enhance"];
const SYNC_STATUSES: readonly SyncStatus[] = [
  "local",
  "pending",
  "syncing",
  "synced",
  "failed",
];

function isValidCaptureMode(value: unknown): value is CaptureMode {
  return typeof value === "string" && (CAPTURE_MODES as string[]).includes(value);
}

function isValidSyncStatus(value: unknown): value is SyncStatus {
  return typeof value === "string" && (SYNC_STATUSES as string[]).includes(value);
}

/** The fields every stored capture must have had since v0.1.0. */
function hasValidBaseShape(
  value: unknown
): value is Record<string, unknown> & {
  id: string;
  text: string;
  sourceTitle: string;
  sourceUrl: string;
  createdAt: string;
} {
  if (typeof value !== "object" || value === null) return false;
  const c = value as Record<string, unknown>;
  return (
    typeof c.id === "string" &&
    c.id.length > 0 &&
    typeof c.text === "string" &&
    c.text.length > 0 &&
    typeof c.sourceTitle === "string" &&
    typeof c.sourceUrl === "string" &&
    typeof c.createdAt === "string" &&
    (c.note === undefined || typeof c.note === "string")
  );
}

/**
 * Fills in defaults for any sync-related fields missing from an
 * older-shape stored record, and drops anything malformed rather than
 * trusting it blindly. Never touches text/note/sourceTitle/sourceUrl.
 */
function normalizeCapture(raw: Record<string, unknown>): Capture {
  return {
    id: raw.id as string,
    text: raw.text as string,
    note: raw.note as string | undefined,
    sourceTitle: raw.sourceTitle as string,
    sourceUrl: raw.sourceUrl as string,
    createdAt: raw.createdAt as string,
    mode: isValidCaptureMode(raw.mode) ? raw.mode : DEFAULT_CAPTURE_MODE,
    syncStatus: isValidSyncStatus(raw.syncStatus) ? raw.syncStatus : DEFAULT_SYNC_STATUS,
    remoteId: typeof raw.remoteId === "string" ? raw.remoteId : undefined,
    lastSyncAttempt: typeof raw.lastSyncAttempt === "string" ? raw.lastSyncAttempt : undefined,
    syncError: typeof raw.syncError === "string" ? raw.syncError : undefined,
  };
}

/** Reads, validates, and migrates the raw capture list. */
async function readRaw(): Promise<Capture[]> {
  let result: Record<string, unknown>;
  try {
    result = await chrome.storage.local.get(STORAGE_KEY);
  } catch (err) {
    console.error("[Illustra] Failed to read from chrome.storage.local", err);
    return [];
  }

  const stored = result[STORAGE_KEY];
  if (!Array.isArray(stored)) return [];

  return stored.filter(hasValidBaseShape).map(normalizeCapture);
}

async function writeRaw(captures: Capture[]): Promise<void> {
  try {
    await chrome.storage.local.set({ [STORAGE_KEY]: captures });
  } catch (err) {
    console.error("[Illustra] Failed to write to chrome.storage.local", err);
    throw err;
  }
}

/** Returns all captures, most recently created first. */
export async function getAllCaptures(): Promise<Capture[]> {
  const captures = await readRaw();
  return [...captures].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export interface NewCaptureInput {
  text: string;
  sourceTitle: string;
  sourceUrl: string;
}

/**
 * Creates and persists a new capture. Returns null if the provided text
 * is empty or whitespace-only after trimming — callers should treat
 * that as "nothing to save" rather than an error.
 *
 * LOCAL-FIRST: this function only ever writes to chrome.storage.local.
 * It has no awareness of any backend and cannot fail because a server
 * is unreachable — a capture is durable on-device the moment this
 * promise resolves. Sync (if/when it exists) always happens strictly
 * after this, never instead of it or before it.
 */
export async function addCapture(input: NewCaptureInput): Promise<Capture | null> {
  const trimmedText = input.text.trim();
  if (trimmedText.length === 0) return null;

  const text =
    trimmedText.length > MAX_CAPTURE_TEXT_LENGTH
      ? `${trimmedText.slice(0, MAX_CAPTURE_TEXT_LENGTH)}…`
      : trimmedText;

  const capture: Capture = {
    id: generateId(),
    text,
    sourceTitle: input.sourceTitle.trim(),
    sourceUrl: input.sourceUrl.trim(),
    createdAt: new Date().toISOString(),
    mode: DEFAULT_CAPTURE_MODE,
    syncStatus: DEFAULT_SYNC_STATUS,
  };

  const existing = await readRaw();
  const next = [capture, ...existing].slice(0, MAX_CAPTURES);
  await writeRaw(next);
  return capture;
}

/** Deletes a single capture by id. No-op if the id doesn't exist. */
export async function deleteCapture(id: string): Promise<void> {
  const existing = await readRaw();
  const next = existing.filter((c) => c.id !== id);
  await writeRaw(next);
}

/**
 * Sets (or clears, when note is an empty string) the personal note on a
 * capture. The underlying `text` field is never touched.
 */
export async function setCaptureNote(id: string, note: string): Promise<void> {
  const trimmed = note.trim().slice(0, MAX_NOTE_LENGTH);
  const existing = await readRaw();
  const next = existing.map((c) =>
    c.id === id ? { ...c, note: trimmed.length > 0 ? trimmed : undefined } : c
  );
  await writeRaw(next);
}

/**
 * Sets the student's processing intention (Keep Original / AI Enhance)
 * for a capture. This only records intent — it never mutates `text`
 * and never triggers any AI call or network request.
 */
export async function setCaptureMode(id: string, mode: CaptureMode): Promise<void> {
  const existing = await readRaw();
  const next = existing.map((c) => (c.id === id ? { ...c, mode } : c));
  await writeRaw(next);
}

/** Deletes every capture. */
export async function clearAllCaptures(): Promise<void> {
  await writeRaw([]);
}

// ---------------------------------------------------------------------
// Sync queue helpers
//
// These exist so a future sync trigger (e.g. "user signed in to
// Illustra") has a ready-made, race-safe way to find work and record
// outcomes, without any other part of the extension needing to know
// how syncing works. Nothing in this file calls these automatically —
// see shared/sync.ts for the (currently unwired) processing loop.
// ---------------------------------------------------------------------

/**
 * Returns captures that are candidates for a sync attempt: queued
 * ("pending") or previously failed ("failed"). Captures already
 * "syncing" are excluded so a second caller can't pick up the same
 * capture mid-flight — see markCaptureSyncing().
 */
export async function getCapturesNeedingSync(): Promise<Capture[]> {
  const captures = await readRaw();
  return captures.filter((c) => c.syncStatus === "pending" || c.syncStatus === "failed");
}

/**
 * Marks a capture as queued for sync. A capture only leaves "local" and
 * becomes eligible for getCapturesNeedingSync() once something
 * explicitly calls this — nothing in the extension calls it today.
 */
export async function enqueueCaptureForSync(id: string): Promise<void> {
  await updateCapture(id, { syncStatus: "pending", syncError: undefined });
}

/**
 * Marks a capture as actively syncing. Callers should call this
 * immediately before invoking CaptureSyncService.syncCapture() so a
 * concurrent queue pass won't submit the same capture twice
 * (duplicate-submission avoidance, ahead of real backend idempotency).
 */
export async function markCaptureSyncing(id: string): Promise<void> {
  await updateCapture(id, {
    syncStatus: "syncing",
    lastSyncAttempt: new Date().toISOString(),
  });
}

/** Records a confirmed successful sync, attaching the backend's ID. */
export async function markCaptureSynced(id: string, remoteId: string): Promise<void> {
  await updateCapture(id, { syncStatus: "synced", remoteId, syncError: undefined });
}

/**
 * Records a failed sync attempt. The capture's local copy — text, note,
 * mode, everything — is left completely untouched; only the sync
 * bookkeeping fields change.
 */
export async function markCaptureSyncFailed(id: string, reason: string): Promise<void> {
  await updateCapture(id, { syncStatus: "failed", syncError: reason });
}

async function updateCapture(id: string, patch: Partial<Capture>): Promise<void> {
  const existing = await readRaw();
  const next = existing.map((c) => (c.id === id ? { ...c, ...patch } : c));
  await writeRaw(next);
}
