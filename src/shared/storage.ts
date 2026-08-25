import type { Capture } from "./types";
import {
  STORAGE_KEY,
  MAX_CAPTURES,
  MAX_CAPTURE_TEXT_LENGTH,
  MAX_NOTE_LENGTH,
} from "./constants";
import { generateId } from "./id";

/**
 * Thin, typed abstraction over chrome.storage.local so the rest of the
 * codebase never calls the raw chrome.storage API directly. Centralizing
 * reads/writes here also means we only have to guard against malformed
 * or missing stored data (corrupt installs, future schema changes,
 * manual edits via chrome://extensions storage inspector) in one place.
 */

/** Runtime check that an unknown value looks like a valid Capture. */
function isValidCapture(value: unknown): value is Capture {
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

/** Reads and validates the raw capture list, discarding anything malformed. */
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

  return stored.filter(isValidCapture);
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

/** Deletes every capture. */
export async function clearAllCaptures(): Promise<void> {
  await writeRaw([]);
}
