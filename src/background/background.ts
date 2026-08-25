import { CONTEXT_MENU_ID, UNTITLED_PAGE_LABEL } from "../shared/constants";
import { addCapture } from "../shared/storage";
import { setupContextMenu } from "./contextMenu";
import { showToast } from "./toast";

// Re-register the context menu on install/update and on browser
// startup. The click listener itself is registered unconditionally at
// module scope below, so it's always live once the service worker
// wakes up for the event — Chrome keeps existing menu registrations
// across normal service-worker sleep/wake cycles, so this does not
// need to run on every wake.
chrome.runtime.onInstalled.addListener(() => {
  void setupContextMenu();
});
chrome.runtime.onStartup.addListener(() => {
  void setupContextMenu();
});

// Guards against the (rare) case of the click event firing twice in
// quick succession for what the user experiences as one click.
let handlingClick = false;

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== CONTEXT_MENU_ID) return;
  if (!tab || typeof tab.id !== "number") return;

  void handleSaveToIllustra(info, tab.id);
});

async function handleSaveToIllustra(
  info: chrome.contextMenus.OnClickData,
  tabId: number
): Promise<void> {
  if (handlingClick) return;
  handlingClick = true;

  try {
    // info.selectionText may be undefined for a whitespace-only
    // selection on some pages, or contain only whitespace/newlines.
    const selectionText = info.selectionText ?? "";

    const tab = await chrome.tabs.get(tabId).catch(() => null);
    const rawTitle = tab?.title ?? "";
    const sourceTitle = rawTitle.trim().length > 0 ? rawTitle.trim() : UNTITLED_PAGE_LABEL;
    const sourceUrl = tab?.url ?? info.pageUrl ?? "";

    const saved = await addCapture({ text: selectionText, sourceTitle, sourceUrl });

    if (saved) {
      await showToast(tabId, "✓ Saved to Illustra");
    } else {
      await showToast(tabId, "Nothing to save — highlight some text first");
    }
  } catch (err) {
    console.error("[Illustra] Failed to save capture", err);
    await showToast(tabId, "Couldn't save to Illustra — try again");
  } finally {
    handlingClick = false;
  }
}
