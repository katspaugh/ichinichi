import DOMPurify from "dompurify";
import type { HabitValues } from "../types";

/**
 * Configuration for DOMPurify
 * Allows basic formatting tags, links, and images with data-image-id
 */
const SANITIZE_CONFIG = {
  ALLOWED_TAGS: [
    "b",
    "i",
    "em",
    "strong",
    "u",
    "s",
    "strike",
    "del",
    "br",
    "p",
    "div",
    "span",
    "img",
    "a",
    "code",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "hr",
    "blockquote",
  ],
  ALLOWED_ATTR: [
    "data-image-id",
    "data-timestamp",
    "data-label",
    "data-weather",
    "alt",
    "width",
    "height",
    "href",
    "target",
    "rel",
    "contenteditable",
  ], // Image attributes (src set dynamically)
  KEEP_CONTENT: true, // Keep text content even if tags are stripped
  RETURN_DOM: false,
  RETURN_DOM_FRAGMENT: false,
};

/**
 * Sanitizes HTML content to prevent XSS attacks
 * Allows only basic text formatting tags and links
 */
export function sanitizeHtml(html: string): string {
  if (!html || typeof html !== "string") {
    return "";
  }

  const result = DOMPurify.sanitize(html, SANITIZE_CONFIG);
  return typeof result === "string" ? result : "";
}

/**
 * Checks if content is empty (no text content)
 * Strips all HTML and checks if anything remains
 */
export function isContentEmpty(html: string): boolean {
  if (!html) return true;

  // Create a temporary div to extract text content
  const temp = document.createElement("div");
  temp.innerHTML = html;
  const hasText = (temp.textContent ?? "").trim().length > 0;
  const hasImages = temp.querySelector("img") !== null;

  return !hasText && !hasImages;
}

/**
 * Checks if a note is empty (no text content and no habit values).
 * A note with habit values but no text should be preserved.
 */
export function isNoteEmpty(
  html: string,
  habits?: HabitValues,
): boolean {
  if (
    habits &&
    Object.values(habits).some(
      (entry) => entry.value !== "" && entry.value !== false && entry.value !== 0,
    )
  ) {
    return false;
  }
  return isContentEmpty(html);
}
