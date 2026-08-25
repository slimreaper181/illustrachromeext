/**
 * Core data model for Illustra Capture.
 *
 * A Capture represents one piece of webpage text a student saved.
 * `text` is the immutable, verbatim selection the student highlighted —
 * it is never edited or overwritten by the app. `note` is a separate,
 * optional, student-authored annotation that can be added or changed
 * at any time without touching `text`.
 *
 * The fields below `createdAt` (`mode`, `syncStatus`, `remoteId`,
 * `lastSyncAttempt`, `syncError`) exist to prepare the extension for a
 * future Illustra backend. None of them currently cause any network
 * activity — see shared/sync.ts and docs/BACKEND_INTEGRATION.md.
 */
export interface Capture {
  /** Unique identifier for this capture (see shared/id.ts). Doubles as the
   *  idempotency key a future backend should use to recognise resubmits. */
  id: string;
  /** The immutable, trimmed text the student highlighted. */
  text: string;
  /** Optional personal note the student attached, kept separate from `text`. */
  note?: string;
  /** Title of the page the capture was taken from. */
  sourceTitle: string;
  /** URL of the page the capture was taken from. */
  sourceUrl: string;
  /** ISO 8601 timestamp of when the capture was created. */
  createdAt: string;

  /**
   * The student's stored processing intention for this capture.
   * "original" — keep the captured text as-is.
   * "enhance" — the student wants Illustra to later process this with AI.
   * Choosing "enhance" does NOT trigger any AI call today; it only
   * records intent for a future backend to act on.
   */
  mode: CaptureMode;

  /**
   * Where this capture stands with respect to backend synchronisation.
   * See shared/sync.ts for the full state-machine description.
   */
  syncStatus: SyncStatus;

  /** Server-assigned ID once a future backend confirms persistence. */
  remoteId?: string;
  /** ISO 8601 timestamp of the most recent sync attempt, if any. */
  lastSyncAttempt?: string;
  /** Human-readable reason the most recent sync attempt failed, if any. */
  syncError?: string;
}

export type CaptureMode = "original" | "enhance";

export type SyncStatus =
  /** Saved on-device only; not queued for sync. This is the default —
   *  the only reachable state until a real backend/trigger exists. */
  | "local"
  /** Queued, waiting for a sync attempt. */
  | "pending"
  /** A sync attempt is currently in flight. */
  | "syncing"
  /** The backend has confirmed this capture was persisted. */
  | "synced"
  /** The most recent sync attempt failed; the local copy is still intact. */
  | "failed";

/** Shape written to chrome.storage.local under STORAGE_KEY. */
export interface CaptureStore {
  captures: Capture[];
}
