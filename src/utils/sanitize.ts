import DOMPurify from 'dompurify';

/**
 * Configuration for DOMPurify
 * Only allows basic formatting tags
 */
const SANITIZE_CONFIG: DOMPurify.Config = {
  ALLOWED_TAGS: [
    'b', 'i', 'em', 'strong', 'u', 's', 'strike', 'del',
    'br', 'p', 'div', 'span'
  ],
  ALLOWED_ATTR: [], // No attributes needed for basic formatting
  KEEP_CONTENT: true, // Keep text content even if tags are stripped
};

/**
 * Sanitizes HTML content to prevent XSS attacks
 * Allows only basic text formatting tags
 */
export function sanitizeHtml(html: string): string {
  if (!html || typeof html !== 'string') {
    return '';
  }

  return DOMPurify.sanitize(html, SANITIZE_CONFIG);
}

/**
 * Checks if content is empty (no text content)
 * Strips all HTML and checks if anything remains
 */
export function isContentEmpty(html: string): boolean {
  if (!html) return true;

  // Create a temporary div to extract text content
  const temp = document.createElement('div');
  temp.innerHTML = sanitizeHtml(html);

  return temp.textContent?.trim().length === 0;
}
