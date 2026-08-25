// Shared, tunable constants for Illustra Capture.

import type { CaptureMode, SyncStatus } from "./types";

/** Key under which the capture list is stored in chrome.storage.local. */
export const STORAGE_KEY = "illustra_captures";

/** Mode assigned to a capture when the student hasn't chosen otherwise. */
export const DEFAULT_CAPTURE_MODE: CaptureMode = "original";

/**
 * Sync status assigned to every new and migrated capture. This is the
 * only reachable status until a real sync trigger (e.g. signing in to
 * an Illustra account) is wired up — see shared/sync.ts.
 */
export const DEFAULT_SYNC_STATUS: SyncStatus = "local";

/**
 * Maximum number of captures retained locally. This is a temporary
 * inbox, not permanent storage, so once the cap is reached the oldest
 * capture is dropped when a new one is saved. 500 is generous for an
 * MVP capture inbox while keeping chrome.storage.local usage well
 * within its per-item and total quota.
 */
export const MAX_CAPTURES = 500;

/**
 * Maximum length (in characters) of captured text. Selections longer
 * than this are trimmed to this length with a trailing marker, so a
 * student can never accidentally capture an entire page's worth of
 * text through a runaway selection. 5000 characters (~800-1000 words)
 * comfortably covers a paragraph or long passage while staying well
 * under chrome.storage.local's per-item quota.
 */
export const MAX_CAPTURE_TEXT_LENGTH = 5000;

/** Maximum length of a personal note. */
export const MAX_NOTE_LENGTH = 500;

/** ID of the "Save to Illustra" context menu item. */
export const CONTEXT_MENU_ID = "illustra-save-to-illustra";

/** Fallback title used when a page has no accessible <title>. */
export const UNTITLED_PAGE_LABEL = "Untitled page";
