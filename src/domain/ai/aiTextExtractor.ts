/**
 * Extracts plain text from HTML and computes content hashes.
 * Works in both browser and worker contexts.
 */

/**
 * Creates a temporary div, sets innerHTML, and returns textContent
 * with all HTML tags stripped.
 */
export function extractPlainText(html: string): string {
  const div = document.createElement("div");
  div.innerHTML = html; // safe: temporary detached element, never inserted into DOM
  return div.textContent ?? "";
}

/**
 * Computes a SHA-256 hex digest of the given text using the Web Crypto API.
 * Encodes text as UTF-8 before hashing.
 */
export async function computeContentHash(text: string): Promise<string> {
  const encoded = new TextEncoder().encode(text);
  const buffer = await crypto.subtle.digest("SHA-256", encoded);
  const bytes = new Uint8Array(buffer);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
