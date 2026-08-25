/**
 * Placeholder authentication types only. There is no Supabase Auth (or
 * any other auth) implementation in this extension yet, and this file
 * does not add one — it exists so a future auth implementation and the
 * sync layer (shared/sync.ts) have an agreed-upon shape to build
 * against, without either side needing to guess at the other.
 *
 * The extension MUST continue to work fully signed-out: every capture
 * feature (save, view, note, delete, clear all) works identically
 * regardless of AuthState, because captures are local-first and never
 * gated on being signed in.
 *
 * Explicitly NOT here, on purpose: no token storage, no session
 * refresh logic, no Supabase client, no credentials of any kind.
 */

export type AuthStatus = "unknown" | "signed-out" | "signed-in";

export interface AuthState {
  /**
   * "unknown" — not yet determined (e.g. still checking on startup).
   * "signed-out" — no Illustra session. This is the only state this
   *   extension version ever actually produces.
   * "signed-in" — reserved for when real auth exists.
   */
  status: AuthStatus;
  /** Illustra user ID, once real auth exists. Never a token or secret. */
  userId?: string;
}

/** The only AuthState this build of the extension ever uses. */
export const UNAUTHENTICATED_STATE: AuthState = { status: "signed-out" };
