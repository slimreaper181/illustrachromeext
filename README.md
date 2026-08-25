# Illustra Capture

A Chrome extension (Manifest V3) that lets a student highlight useful text
on any webpage, right-click, and save it into a temporary **Illustra
capture inbox** — the first step of the future Illustra learning workflow.

This is the **capture-layer MVP only**. It does not talk to any backend,
does not require login, and does not run any AI processing. It saves
captures locally on the student's machine using `chrome.storage.local`.

## 1. What it does

1. Student highlights text on a webpage.
2. Student right-clicks and selects **Save to Illustra**.
3. The extension captures the selected text, the page title, the page
   URL, and a timestamp, and stores it in a local capture inbox.
4. A small, non-blocking toast (`✓ Saved to Illustra`) confirms the save.
5. Student clicks the toolbar icon to open the popup and see their
   recent captures, add a personal note to any of them, or delete them.

## 2. Current MVP features

- **Context-menu capture** — "Save to Illustra" appears only when text is
  selected on the page.
- **Local persistence** — captures survive popup close, tab switches,
  service-worker restarts, and full browser restarts (`chrome.storage.local`).
- **Popup inbox** — recent captures shown newest-first, each with a
  preview of the text, source title, source domain, and a readable
  timestamp.
- **Personal notes** — a short note can be attached to any capture
  without ever modifying the original captured text.
- **Delete** — remove a single capture.
- **Clear all** — two-step, in-place confirmation (click once to arm,
  click again within a few seconds to confirm) — no `window.confirm`,
  no modal dialogs.
- **Subtle capture confirmation** — a small toast injected only into the
  tab where the capture happened, auto-dismissing after ~2 seconds.
- **Malformed-selection handling** — empty or whitespace-only selections
  are rejected before anything is written to storage.
- **Plain-text rendering** — all captured/user content is rendered with
  `textContent`, never `innerHTML`, so HTML- or script-looking captured
  text can never execute in the popup.

### What's intentionally *not* built yet

Per the product scope for this MVP, none of the following are
implemented: Illustra account login/authentication, backend sync, AI
enhancement, summarisation, structured notes generation, flashcards,
quiz generation, whole-page scraping, PDF processing, OCR, screenshot
capture, or browsing-history collection. The extension only acts when
the student explicitly invokes "Save to Illustra" on a selection — it
never runs continuously and never reads page content on its own.

## 3. Project architecture

```
illustrachromeext/
├── manifest.json              # MV3 manifest (source of truth, copied into dist/)
├── package.json
├── tsconfig.json
├── build.mjs                  # esbuild-based build script
├── icons/                     # placeholder brand icons (16/48/128)
├── src/
│   ├── shared/
│   │   ├── types.ts           # Capture data model
│   │   ├── constants.ts       # storage key, limits, menu id
│   │   ├── id.ts              # unique capture ID generation
│   │   └── storage.ts         # typed chrome.storage.local abstraction
│   ├── background/
│   │   ├── background.ts      # service worker entry point / wiring
│   │   ├── contextMenu.ts     # "Save to Illustra" menu registration
│   │   └── toast.ts           # on-page confirmation toast (injected on demand)
│   └── popup/
│       ├── popup.html
│       ├── popup.css          # Illustra visual system
│       └── popup.ts           # renders/edits/deletes captures
└── dist/                      # build output — load THIS folder into Chrome (git-ignored)
```

Each responsibility lives in its own module: the manifest only declares
surfaces and permissions, the background script only wires events, all
`chrome.storage` access goes through `shared/storage.ts`, and the popup
only renders and reacts to user actions on the data that storage gives
it. Nothing calls the raw `chrome.storage` API outside of `storage.ts`.

### Data model

```ts
export interface Capture {
  id: string;
  text: string;        // immutable — the original highlighted text
  note?: string;        // separate, optional, student-authored
  sourceTitle: string;
  sourceUrl: string;
  createdAt: string;    // ISO 8601
}
```

`text` is never edited after creation. Notes are a distinct field, set
independently via `setCaptureNote()`, so the original source material
and the student's own annotation can never be conflated.

### Chosen limits (documented, tunable in `src/shared/constants.ts`)

- **`MAX_CAPTURE_TEXT_LENGTH = 5000` characters** — a captured selection
  longer than this is trimmed (with a trailing `…`) so a runaway
  selection can't balloon storage or the UI. ~800–1000 words, comfortably
  covering a long passage while staying well under `chrome.storage.local`'s
  per-item quota.
- **`MAX_CAPTURES = 500`** — the inbox keeps the 500 most recent
  captures; older ones are dropped automatically. This is a temporary
  inbox, not permanent storage.
- **`MAX_NOTE_LENGTH = 500`** characters for a personal note.

## 4. Chrome permissions used (and why)

| Permission | Why it's needed |
|---|---|
| `contextMenus` | To add the "Save to Illustra" right-click menu item. |
| `storage` | To persist captures locally via `chrome.storage.local`. |
| `activeTab` | Grants temporary access to the *one* tab the student just right-clicked in — the permission is scoped to that single user gesture. |
| `scripting` | Lets the background script inject the small confirmation toast into that same tab, only immediately after a successful capture. |

**No `host_permissions` and no `<all_urls>` content script are used.**
The extension never runs on every page and never reads page content in
the background — it only acts within the single click that invokes
"Save to Illustra", using the selection text Chrome already includes in
the context-menu click event. There is no persistent content script and
no passive page monitoring.

## 5. Install dependencies

Requires Node.js 18+.

```bash
npm install
```

## 6. Build

```bash
npm run build
```

This type-checks the project (`tsc --noEmit`) and bundles it with
esbuild into `dist/`, which contains everything Chrome needs
(`manifest.json`, `background.js`, `popup.html`/`popup.css`/`popup.js`,
and `icons/`).

For iterative development, `npm run watch` rebuilds on file changes
(reload the extension in `chrome://extensions` after each change).

## 7. Load it into Chrome

1. Run `npm install && npm run build`.
2. Open `chrome://extensions`.
3. Turn on **Developer mode** (top-right toggle).
4. Click **Load unpacked**.
5. Select the `dist/` folder inside this project.
6. The "Illustra Capture" icon appears in your toolbar.

## 8. How to test it

1. Visit any normal webpage (not a `chrome://` page — see limitations).
2. Highlight some text.
3. Right-click → **Save to Illustra**. You should see a small
   `✓ Saved to Illustra` toast in the bottom-right of the page.
4. Click the toolbar icon — the capture should appear at the top of the
   list with the page title, domain, and a readable timestamp.
5. Click **Add note**, type something, **Save note** — confirm the note
   appears under the capture and the original text is unchanged.
6. Click **Delete** on a capture and confirm it disappears.
7. Add a few captures, click **Clear all** once (button turns into
   "Confirm clear?"), then click again to confirm everything is removed
   and the empty state appears.
8. Try right-clicking with nothing selected, or a selection of only
   spaces/newlines — nothing should be saved.
9. Try selecting text containing emoji, non-Latin scripts, or text that
   looks like `<script>` — it should capture correctly and always render
   as plain text in the popup (never execute).
10. Close and reopen the popup, switch tabs, or restart Chrome —
    captures should still be there.

This flow (menu registration, storage persistence, note editing,
delete, two-step clear-all, and safe rendering of HTML-/script-looking
and Unicode/emoji text) has been exercised end-to-end in a headless
Chromium instance with the built `dist/` extension loaded, with no
console or runtime errors.

## 9. Current limitations

- Works on standard `http(s)` pages only. Chrome internal pages
  (`chrome://…`), the Chrome Web Store, and PDF viewer pages don't allow
  extensions to inject the confirmation toast or, in some cases, don't
  offer text selection at all — the capture flow depends on Chrome
  exposing a right-click "selection" context, which those pages
  generally don't.
- No sync across devices — captures live only in this browser's local
  `chrome.storage.local`.
- No account, login, or backend — this is a local-only inbox.
- No AI processing of any kind yet.
- No editing of the original captured text (by design — it stays
  immutable; only notes are editable).
- Capture text over 5000 characters is trimmed (see §3 for rationale).

## 10. Planned future capabilities

Per the product vision, later milestones will add, after a capture is
saved: **Keep Original**, **AI Enhance**, **Turn into structured
notes**, **Explain**, **Summarise**, **Create flashcards**, and
**Generate quiz questions**, plus Illustra account login and backend
sync so captures follow the student across devices. None of this is
implemented in this MVP.
