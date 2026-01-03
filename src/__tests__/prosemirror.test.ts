/**
 * @jest-environment jsdom
 */

import { parseHtmlToDoc, serializeDocToHtml, isHtmlEquivalent } from '../editor/serializer';

describe('ProseMirror HTML Serializer', () => {
  describe('parseHtmlToDoc and serializeDocToHtml', () => {
    it('should round-trip simple HTML', () => {
      const html = '<p>Hello world</p>';
      const doc = parseHtmlToDoc(html);
      const result = serializeDocToHtml(doc);
      expect(result).toBe(html);
    });

    it('should handle bold text', () => {
      const html = '<p>Hello <strong>world</strong></p>';
      const doc = parseHtmlToDoc(html);
      const result = serializeDocToHtml(doc);
      expect(result).toBe(html);
    });

    it('should handle italic text', () => {
      const html = '<p>Hello <em>world</em></p>';
      const doc = parseHtmlToDoc(html);
      const result = serializeDocToHtml(doc);
      expect(result).toBe(html);
    });

    it('should handle underline text', () => {
      const html = '<p>Hello <u>world</u></p>';
      const doc = parseHtmlToDoc(html);
      const result = serializeDocToHtml(doc);
      expect(result).toBe(html);
    });

    it('should handle strikethrough text', () => {
      const html = '<p>Hello <s>world</s></p>';
      const doc = parseHtmlToDoc(html);
      const result = serializeDocToHtml(doc);
      expect(result).toBe(html);
    });

    it('should handle links', () => {
      const html = '<p>Visit <a href="https://example.com" target="_blank" rel="noopener noreferrer">example</a></p>';
      const doc = parseHtmlToDoc(html);
      const result = serializeDocToHtml(doc);
      expect(result).toBe(html);
    });

    it('should handle horizontal rules', () => {
      const html = '<p>Before</p><hr><p>After</p>';
      const doc = parseHtmlToDoc(html);
      const result = serializeDocToHtml(doc);
      expect(result).toBe(html);
    });

    it('should handle images with data-image-id', () => {
      const html = '<p><img data-image-id="test-123" alt="Test image" width="800" height="600"></p>';
      const doc = parseHtmlToDoc(html);
      const result = serializeDocToHtml(doc);
      expect(result).toBe(html);
    });

    it('should handle checkboxes', () => {
      const html = '<p><input type="checkbox"></p>';
      const doc = parseHtmlToDoc(html);
      const result = serializeDocToHtml(doc);
      expect(result).toBe(html);
    });

    it('should handle checked checkboxes', () => {
      const html = '<p><input type="checkbox" checked="checked"></p>';
      const doc = parseHtmlToDoc(html);
      const result = serializeDocToHtml(doc);
      expect(result).toBe(html);
    });

    it('should handle multiple paragraphs', () => {
      const html = '<p>First paragraph</p><p>Second paragraph</p>';
      const doc = parseHtmlToDoc(html);
      const result = serializeDocToHtml(doc);
      expect(result).toBe(html);
    });

    it('should handle mixed formatting', () => {
      const html = '<p><strong>Bold</strong> and <em>italic</em> and <u>underline</u></p>';
      const doc = parseHtmlToDoc(html);
      const result = serializeDocToHtml(doc);
      expect(result).toBe(html);
    });

    it('should handle empty content', () => {
      const html = '';
      const doc = parseHtmlToDoc(html);
      const result = serializeDocToHtml(doc);
      expect(result).toBe('<p></p>');
    });

    it('should normalize div to paragraph', () => {
      const html = '<div>Hello world</div>';
      const doc = parseHtmlToDoc(html);
      const result = serializeDocToHtml(doc);
      expect(result).toBe('<p>Hello world</p>');
    });
  });

  describe('isHtmlEquivalent', () => {
    it('should consider identical HTML as equivalent', () => {
      const html1 = '<p>Hello world</p>';
      const html2 = '<p>Hello world</p>';
      expect(isHtmlEquivalent(html1, html2)).toBe(true);
    });

    it('should ignore whitespace differences', () => {
      const html1 = '<p>Hello   world</p>';
      const html2 = '<p>Hello world</p>';
      expect(isHtmlEquivalent(html1, html2)).toBe(true);
    });

    it('should consider different text as not equivalent', () => {
      const html1 = '<p>Hello world</p>';
      const html2 = '<p>Goodbye world</p>';
      expect(isHtmlEquivalent(html1, html2)).toBe(false);
    });

    it('should detect different images', () => {
      const html1 = '<p><img data-image-id="id1"></p>';
      const html2 = '<p><img data-image-id="id2"></p>';
      expect(isHtmlEquivalent(html1, html2)).toBe(false);
    });

    it('should detect different checkbox states', () => {
      const html1 = '<p><input type="checkbox"></p>';
      const html2 = '<p><input type="checkbox" checked="checked"></p>';
      expect(isHtmlEquivalent(html1, html2)).toBe(false);
    });

    it('should detect different links', () => {
      const html1 = '<p><a href="https://example1.com">Link</a></p>';
      const html2 = '<p><a href="https://example2.com">Link</a></p>';
      expect(isHtmlEquivalent(html1, html2)).toBe(false);
    });
  });
});
