/**
 * Generates a unique ID for a capture. Prefers crypto.randomUUID(),
 * which is available in both the MV3 service worker and popup
 * contexts, with a low-collision fallback in case it's ever missing.
 */
export function generateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  const random = Math.random().toString(36).slice(2);
  return `capture-${Date.now()}-${random}`;
}
