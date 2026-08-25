# Backend Integration — Proposed Contract (NOT YET IMPLEMENTED)

**Status: proposal only.** No endpoint described in this document exists
today. The extension currently has no network permission, makes no
network requests, and does not depend on anything here to function. This
document exists so the Illustra backend/CTO team has a concrete starting
point to react to, correct, or replace — not a spec to implement as-is.

Nothing in this document should be read as "the extension already talks
to this." The extension-side integration boundary (`shared/sync.ts`) is
built and tested against a `NoopCaptureSyncService` that makes zero
requests. Wiring in a real backend means writing a new class that
implements `CaptureSyncService` and swapping it in for
`defaultSyncService` — nothing else in the extension should need to
change.

## Why this shape

The extension is local-first: a capture is durable in
`chrome.storage.local` the instant it's saved, independent of whether a
backend, session, or network exists at that moment. Sync is something
that happens *to* an already-safe local capture, never a precondition
for saving one. See `shared/sync.ts` and `shared/storage.ts` for the
extension-side implementation of that guarantee.

## Proposed request

```http
POST /api/captures
Content-Type: application/json
Authorization: <TBD — see open question 2>
```

```json
{
  "clientCaptureId": "string",
  "text": "string",
  "note": "string | null",
  "sourceTitle": "string",
  "sourceUrl": "string",
  "capturedAt": "ISO-8601 timestamp",
  "mode": "original | enhance"
}
```

- `clientCaptureId` is the extension's local `Capture.id` (a
  `crypto.randomUUID()`), sent so the backend can treat it as an
  **idempotency key** — see open question 6. The extension may submit
  the same capture more than once (e.g. a retried "failed" sync); the
  backend should treat a resubmission of the same `clientCaptureId` as
  a no-op or an upsert, not a new record.
- `mode` records the student's stated intention (`"original"` = keep as
  captured, `"enhance"` = the student wants AI processing later). The
  extension never performs AI processing itself and never mutates
  `text` based on `mode` — see open question 10 for how enhancement
  would actually be triggered.
- `note` is the student's personal annotation, always distinct from
  `text`.

## Proposed successful response

```json
{
  "success": true,
  "captureId": "server-generated-id"
}
```

The extension stores `captureId` as `Capture.remoteId` and marks the
capture `"synced"`. The local capture (`text`, `note`, `mode`, etc.) is
left exactly as it was — `remoteId` is additive bookkeeping, never a
replacement for local data.

## Proposed failure response

```json
{
  "success": false,
  "reason": "string"
}
```

The extension records `reason` as `Capture.syncError` and marks the
capture `"failed"`. The local copy is never deleted or altered because a
sync attempt failed.

## Open questions for the Illustra CTOs

1. Will the extension communicate directly with Supabase (e.g. via the
   Supabase JS client and a public anon key with RLS enforcing access),
   or exclusively through an Illustra-owned API route/Edge Function that
   itself talks to Supabase? This changes what the extension needs to
   ship (a Supabase client + anon key vs. a plain `fetch` to an Illustra
   domain) and where auth is enforced.
2. How should the extension obtain the existing Illustra user's session
   — a web-based OAuth-style handoff into the extension, a token the
   student copies from the Illustra web app, `chrome.identity`, or
   something else? This determines whether `AuthState` (see
   `shared/auth.ts`) ever needs more than `signed-out`.
3. How should session/token refresh work inside a Manifest V3 service
   worker, which can be terminated and restarted at any time and cannot
   rely on long-lived in-memory state?
4. Which database table (or tables) owns captures, and does its schema
   already resemble the `Capture` shape in `shared/types.ts`, or does
   the extension's payload need to be transformed before it fits?
5. What Row Level Security policies are required so a student can only
   read/write their own captures, and do those policies expect the
   request to arrive with a Supabase-issued JWT, an Illustra session
   cookie, or something else?
6. Should `clientCaptureId` have a unique constraint (e.g. unique per
   `(user_id, client_capture_id)`) so a duplicate submission is rejected
   or upserted at the database layer, rather than relying on the
   extension to never double-submit?
7. What maximum capture size should the backend accept? The extension
   currently caps captured text client-side at 5000 characters
   (`MAX_CAPTURE_TEXT_LENGTH` in `shared/constants.ts`) purely to keep
   local storage and the popup UI sane — this is not necessarily the
   right server-side limit and should be revisited independently.
8. What rate limiting should exist on this endpoint, and should the
   extension implement any client-side throttling to stay under it?
9. Should `sourceUrl` be stored in full, or should query strings /
   fragments be stripped or hashed before persistence (privacy,
   PII-in-URLs considerations)?
10. How should AI-enhancement jobs actually be initiated for a capture
    saved with `mode: "enhance"` — a separate endpoint the extension (or
    the Illustra web app) calls after sync succeeds, a backend trigger
    that watches for `mode = 'enhance'` rows, or something else? The
    extension only records the intention today; it has no opinion on
    how enhancement is actually kicked off.
11. What happens to a student's captures when they delete their Illustra
    account — cascade-deleted, retained for a grace period, anonymized?
12. Does AI processing happen synchronously (student waits for a
    response) or via a job queue the student polls or subscribes to?
    This affects whether the extension (or the Illustra web app) needs
    a way to show "processing" status beyond today's sync states.

## What the extension is ready for today

- Every `Capture` carries a stable local `id` usable as an idempotency
  key (question 6).
- `syncStatus` (`local | pending | syncing | synced | failed`) and
  `syncError` give a real backend integration somewhere to report
  outcomes without the extension needing any redesign.
- `CaptureSyncService` (`shared/sync.ts`) is the single seam a real
  implementation plugs into. `syncPendingCaptures()` is a ready, but
  currently uncalled, single-pass queue runner — see its doc comment for
  intended retry behaviour (retries happen only when something calls it
  again; there is no automatic timer or backoff loop yet, by design).
- `AuthState` (`shared/auth.ts`) gives auth work a shape to target
  without the extension needing to guess at a real implementation first.

## What is explicitly out of scope until the above is answered

Real Supabase/API calls, storing any session token or credential,
triggering AI processing, automatic/looping retry, and any UI implying
a capture is backed up when it is not.
