/**
 * Shows a small, self-dismissing toast on the page where a capture just
 * happened. This is intentionally not a content script that runs on
 * every page — it's injected on demand via chrome.scripting, scoped to
 * the single tab where the user just invoked the context menu (which
 * grants the temporary "activeTab" permission for that gesture). No
 * page ever runs Illustra code unless the student just triggered
 * "Save to Illustra" on it.
 */

/**
 * This function is serialized and executed inside the target page, so
 * it must be fully self-contained (no closures over outer variables)
 * and must not reference anything from the extension's own module
 * scope. It builds the toast purely with DOM APIs and textContent, so
 * it never parses any untrusted string as HTML.
 */
function renderToastInPage(message: string): void {
  const EXISTING_ID = "__illustra_capture_toast__";
  const previous = document.getElementById(EXISTING_ID);
  if (previous) previous.remove();

  const toast = document.createElement("div");
  toast.id = EXISTING_ID;
  toast.textContent = message;
  toast.setAttribute("role", "status");

  Object.assign(toast.style, {
    position: "fixed",
    bottom: "20px",
    right: "20px",
    zIndex: "2147483647",
    background: "#0B1220",
    color: "#F2F7FF",
    padding: "10px 16px",
    borderRadius: "10px",
    fontFamily:
      "'Geist', -apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, Roboto, sans-serif",
    fontSize: "13px",
    fontWeight: "500",
    boxShadow: "0 8px 24px rgba(11, 18, 32, 0.28)",
    border: "1px solid rgba(47, 111, 237, 0.55)",
    opacity: "0",
    transform: "translateY(6px)",
    transition: "opacity 160ms ease, transform 160ms ease",
    pointerEvents: "none",
  } as Partial<CSSStyleDeclaration>);

  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    toast.style.opacity = "1";
    toast.style.transform = "translateY(0)";
  });

  const DISPLAY_MS = 2200;
  const FADE_MS = 200;
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(6px)";
    setTimeout(() => toast.remove(), FADE_MS);
  }, DISPLAY_MS);
}

/**
 * Injects the toast into the given tab. Fails silently (logging only)
 * on pages where script injection isn't possible — e.g. chrome:// and
 * other internal pages, the Chrome Web Store, or a tab that closed
 * between the capture and the injection.
 */
export async function showToast(tabId: number, message: string): Promise<void> {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: renderToastInPage,
      args: [message],
    });
  } catch (err) {
    console.warn("[Illustra] Could not show confirmation toast on this page:", err);
  }
}
