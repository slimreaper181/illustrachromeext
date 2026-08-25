/**
 * Core data model for Illustra Capture.
 *
 * A Capture represents one piece of webpage text a student saved.
 * `text` is the immutable, verbatim selection the student highlighted —
 * it is never edited or overwritten by the app. `note` is a separate,
 * optional, student-authored annotation that can be added or changed
 * at any time without touching `text`.
 */
export interface Capture {
  /** Unique identifier for this capture (see shared/id.ts). */
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
}

/** Shape written to chrome.storage.local under STORAGE_KEY. */
export interface CaptureStore {
  captures: Capture[];
}
