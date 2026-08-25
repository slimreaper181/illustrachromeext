import type { Capture } from "../shared/types";
import {
  getAllCaptures,
  deleteCapture,
  setCaptureNote,
  clearAllCaptures,
} from "../shared/storage";
import { STORAGE_KEY } from "../shared/constants";

const PREVIEW_LENGTH = 320;
const CLEAR_CONFIRM_WINDOW_MS = 4000;

const listEl = document.getElementById("capture-list") as HTMLElement;
const countEl = document.getElementById("capture-count") as HTMLElement;
const clearAllBtn = document.getElementById("clear-all-btn") as HTMLButtonElement;
const captureCardTemplate = document.getElementById(
  "capture-card-template"
) as HTMLTemplateElement;
const emptyStateTemplate = document.getElementById(
  "empty-state-template"
) as HTMLTemplateElement;

let clearConfirmTimeout: number | undefined;

async function refresh(): Promise<void> {
  const captures = await getAllCaptures();
  render(captures);
}

function render(captures: Capture[]): void {
  listEl.replaceChildren();

  countEl.textContent =
    captures.length === 0
      ? ""
      : `${captures.length} capture${captures.length === 1 ? "" : "s"}`;
  clearAllBtn.hidden = captures.length === 0;

  if (captures.length === 0) {
    listEl.appendChild(emptyStateTemplate.content.cloneNode(true));
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const capture of captures) {
    fragment.appendChild(buildCaptureCard(capture));
  }
  listEl.appendChild(fragment);
}

function buildCaptureCard(capture: Capture): HTMLElement {
  const node = captureCardTemplate.content.cloneNode(true) as DocumentFragment;
  const card = node.querySelector(".capture-card") as HTMLElement;

  const textEl = card.querySelector(".capture-text") as HTMLElement;
  const noteEl = card.querySelector(".capture-note") as HTMLElement;
  const titleEl = card.querySelector(".capture-title") as HTMLElement;
  const hostEl = card.querySelector(".capture-host") as HTMLElement;
  const timeEl = card.querySelector(".capture-time") as HTMLTimeElement;
  const noteBtn = card.querySelector(".note-btn") as HTMLButtonElement;
  const deleteBtn = card.querySelector(".delete-btn") as HTMLButtonElement;
  const noteEditor = card.querySelector(".note-editor") as HTMLElement;
  const noteInput = card.querySelector(".note-input") as HTMLTextAreaElement;
  const cancelNoteBtn = card.querySelector(".cancel-note-btn") as HTMLButtonElement;
  const saveNoteBtn = card.querySelector(".save-note-btn") as HTMLButtonElement;

  // All values below are set via textContent / value, never innerHTML,
  // so captured page content — including anything that looks like
  // HTML or script — is always rendered as inert plain text.
  textEl.textContent = truncate(capture.text, PREVIEW_LENGTH);
  noteEl.textContent = capture.note ?? "";
  titleEl.textContent = capture.sourceTitle || "Untitled page";
  titleEl.title = capture.sourceTitle;
  hostEl.textContent = getHostname(capture.sourceUrl);
  timeEl.textContent = formatTimestamp(capture.createdAt);
  timeEl.dateTime = capture.createdAt;
  noteInput.value = capture.note ?? "";
  noteBtn.textContent = capture.note ? "Edit note" : "Add note";

  noteBtn.addEventListener("click", () => {
    noteEditor.hidden = !noteEditor.hidden;
    if (!noteEditor.hidden) noteInput.focus();
  });

  cancelNoteBtn.addEventListener("click", () => {
    noteInput.value = capture.note ?? "";
    noteEditor.hidden = true;
  });

  saveNoteBtn.addEventListener("click", () => {
    void (async () => {
      await setCaptureNote(capture.id, noteInput.value);
      await refresh();
    })();
  });

  deleteBtn.addEventListener("click", () => {
    void (async () => {
      await deleteCapture(capture.id);
      await refresh();
    })();
  });

  return card;
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).trimEnd()}…`;
}

function getHostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url || "unknown source";
  }
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

clearAllBtn.addEventListener("click", () => {
  if (clearAllBtn.classList.contains("confirm-danger")) {
    window.clearTimeout(clearConfirmTimeout);
    void (async () => {
      await clearAllCaptures();
      resetClearButton();
      await refresh();
    })();
    return;
  }

  clearAllBtn.classList.add("confirm-danger");
  clearAllBtn.textContent = "Confirm clear?";
  clearConfirmTimeout = window.setTimeout(resetClearButton, CLEAR_CONFIRM_WINDOW_MS);
});

function resetClearButton(): void {
  clearAllBtn.classList.remove("confirm-danger");
  clearAllBtn.textContent = "Clear all";
}

document.addEventListener("DOMContentLoaded", () => {
  void refresh();
});

// Keep the popup in sync if a capture is added while it happens to
// already be open, or captures change in another view.
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local" && STORAGE_KEY in changes) {
    void refresh();
  }
});
