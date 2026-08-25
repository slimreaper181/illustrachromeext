import type { Capture } from "./types";
import {
  getCapturesNeedingSync,
  markCaptureSyncing,
  markCaptureSynced,
  markCaptureSyncFailed,
} from "./storage";

/**
 * ============================================================================
 * SYNC BOUNDARY — this is the seam future engineers connect to the real
 * Illustra backend. Nothing on the other side of this file (background
 * script, popup) needs to know whether captures end up in Supabase, an
 * Illustra API route, an Edge Function, or something else entirely.
 *
 * Nothing in this file makes a network request today. See
 * docs/BACKEND_INTEGRATION.md for the proposed (not yet implemented)
 * wire contract and the open questions the backend team needs to answer
 * before a real implementation can be written.
 * ============================================================================
 */

export interface SyncSuccess {
  success: true;
  /** The backend-assigned ID for this capture. */
  remoteId: string;
}

export interface SyncFailure {
  success: false;
  /**
   * Short machine-readable reason, e.g. "BACKEND_NOT_CONFIGURED",
   * "NOT_AUTHENTICATED", "NETWORK_ERROR", "SERVER_ERROR". Stored
   * verbatim on the capture as `syncError` for debugging — never shown
   * to the student as a raw code (see popup rendering of syncStatus).
   */
  reason: string;
}

export type SyncResult = SyncSuccess | SyncFailure;

/**
 * The contract any future backend integration must satisfy.
 *
 * Implementations MUST:
 *  - use `capture.id` as the idempotency key so retried/duplicate calls
 *    for the same capture never create duplicate server-side records
 *    (see docs/BACKEND_INTEGRATION.md, `clientCaptureId`);
 *  - never mutate or re-derive `capture.text` — it is sent as captured;
 *  - never throw for an expected failure (no auth, offline, server
 *    error) — return a SyncFailure instead so the queue can record it
 *    and move on without local data ever being at risk.
 */
export interface CaptureSyncService {
  syncCapture(capture: Capture): Promise<SyncResult>;
}

/**
 * Development-safe default implementation. Makes NO network requests
 * and NEVER reports a false success. This is intentional: pretending a
 * capture was persisted server-side when it wasn't would be worse than
 * doing nothing, because it could make a future "synced" filter hide a
 * capture that only ever existed locally.
 *
 * >>> Real backend integration (Supabase / Illustra API) belongs behind
 * >>> a NEW class that implements CaptureSyncService, swapped in for
 * >>> `defaultSyncService` below — this class should not be edited into
 * >>> "half-working" for that purpose.
 */
export class NoopCaptureSyncService implements CaptureSyncService {
  async syncCapture(_capture: Capture): Promise<SyncResult> {
    return { success: false, reason: "BACKEND_NOT_CONFIGURED" };
  }
}

/**
 * The sync service the rest of the extension is wired to. Swapping in a
 * real implementation later is a one-line change here — nothing else
 * should need to change.
 */
export const defaultSyncService: CaptureSyncService = new NoopCaptureSyncService();

export interface SyncPassSummary {
  attempted: number;
  succeeded: number;
  failed: number;
}

/**
 * Runs one pass over captures needing sync (status "pending" or
 * "failed"), attempting each exactly once via the given service.
 *
 * NOT CALLED FROM ANYWHERE YET. This is prepared infrastructure, not an
 * active background loop — per the current product scope there is no
 * event (sign-in, network-online, alarm) that should trigger it, and
 * wiring one up is explicitly out of scope until authentication and a
 * real backend exist. A future engineer can call this from, e.g., a
 * `chrome.alarms` handler or an "on sign-in" event once those exist.
 *
 * RETRY BEHAVIOUR (intended, not yet implemented as automatic): a
 * "failed" capture is picked up again the *next* time this function
 * runs — there is no automatic re-queue timer here, so retries only
 * happen when something explicitly calls this again (e.g. the student
 * reopening the popup while signed in, or a future manual "Retry sync"
 * action). This function deliberately does not loop, back off, or retry
 * within a single call, so it can never become a runaway request loop
 * against a backend that's down.
 */
export async function syncPendingCaptures(
  service: CaptureSyncService = defaultSyncService
): Promise<SyncPassSummary> {
  const queue = await getCapturesNeedingSync();
  const summary: SyncPassSummary = { attempted: 0, succeeded: 0, failed: 0 };

  for (const capture of queue) {
    summary.attempted += 1;
    // Marking "syncing" first (and re-reading the queue on every future
    // call) means two overlapping passes won't both submit the same
    // capture — the capture's local text/note are never touched here.
    await markCaptureSyncing(capture.id);

    let result: SyncResult;
    try {
      result = await service.syncCapture(capture);
    } catch (err) {
      // A well-behaved CaptureSyncService should never throw (see the
      // interface contract above), but a capture's local durability
      // must not depend on that discipline — treat a thrown error the
      // same as an explicit SyncFailure rather than letting it escape.
      result = { success: false, reason: err instanceof Error ? err.message : "UNKNOWN_ERROR" };
    }

    if (result.success) {
      await markCaptureSynced(capture.id, result.remoteId);
      summary.succeeded += 1;
    } else {
      await markCaptureSyncFailed(capture.id, result.reason);
      summary.failed += 1;
    }
  }

  return summary;
}
