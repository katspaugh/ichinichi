import { DOMParser, DOMSerializer, Node as ProseMirrorNode } from 'prosemirror-model';
import { schema } from './schema';

/**
 * Parses HTML string into a ProseMirror document
 */
export function parseHtmlToDoc(html: string): ProseMirrorNode {
  const container = document.createElement('div');
  container.innerHTML = html;
  
  // If empty, create a single empty paragraph
  if (!container.firstChild) {
    container.innerHTML = '<p></p>';
  }
  
  const parser = DOMParser.fromSchema(schema);
  return parser.parse(container);
}

/**
 * Serializes a ProseMirror document to HTML string
 * Note: Images will have data-image-id but no src attribute
 * (URLs are resolved asynchronously by the ImageNodeView)
 */
export function serializeDocToHtml(doc: ProseMirrorNode): string {
  const serializer = DOMSerializer.fromSchema(schema);
  const fragment = serializer.serializeFragment(doc.content);
  
  const container = document.createElement('div');
  container.appendChild(fragment);
  
  return container.innerHTML;
}

/**
 * Checks if two HTML strings are semantically equivalent
 * (Used to prevent unnecessary re-renders)
 */
export function isHtmlEquivalent(html1: string, html2: string): boolean {
  const container1 = document.createElement('div');
  const container2 = document.createElement('div');
  
  container1.innerHTML = html1;
  container2.innerHTML = html2;
  
  // Normalize whitespace
  const normalize = (el: HTMLElement) => {
    const text = (el.textContent ?? '')
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      .replace(/\u00a0/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    
    const images = Array.from(el.querySelectorAll('img[data-image-id]'))
      .map((img) => img.getAttribute('data-image-id') ?? '')
      .filter(Boolean);
    
    const checkboxes = Array.from(el.querySelectorAll('input[type="checkbox"]'))
      .map((input) => (input as HTMLInputElement).checked ? '1' : '0');
    
    const links = Array.from(el.querySelectorAll('a[href]'))
      .map((anchor) => anchor.getAttribute('href') ?? '')
      .filter(Boolean);
    
    return JSON.stringify({ text, images, checkboxes, links });
  };
  
  return normalize(container1) === normalize(container2);
}
