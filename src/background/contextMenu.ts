import { CONTEXT_MENU_ID } from "../shared/constants";

/**
 * (Re)registers the "Save to Illustra" context menu item. Chrome menu
 * registrations don't survive a browser restart, and calling
 * chrome.contextMenus.create() twice with the same id throws, so we
 * always clear existing items first. This keeps setup idempotent
 * whether it runs on install, update, or browser startup.
 */
export async function setupContextMenu(): Promise<void> {
  await chrome.contextMenus.removeAll();
  chrome.contextMenus.create({
    id: CONTEXT_MENU_ID,
    title: "Save to Illustra",
    // Only appears when the user has an active text selection — the
    // menu is never shown (and no capture is possible) otherwise.
    contexts: ["selection"],
  });
}
