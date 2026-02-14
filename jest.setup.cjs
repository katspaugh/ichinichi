require("fake-indexeddb/auto");
const { webcrypto } = require("node:crypto");
const { TextDecoder, TextEncoder } = require("node:util");

if (!globalThis.crypto || !globalThis.crypto.subtle) {
  Object.defineProperty(globalThis, "crypto", {
    value: webcrypto,
    configurable: true,
  });
  if (typeof window !== "undefined") {
    Object.defineProperty(window, "crypto", {
      value: webcrypto,
      configurable: true,
    });
  }
}

if (!globalThis.TextEncoder) {
  globalThis.TextEncoder = TextEncoder;
}

if (!globalThis.TextDecoder) {
  globalThis.TextDecoder = TextDecoder;
}

if (!globalThis.structuredClone) {
  globalThis.structuredClone = (value) => JSON.parse(JSON.stringify(value));
}

// ProseMirror needs getClientRects/getBoundingClientRect for coordsAtPos/scrollToSelection.
// JSDOM doesn't implement these on Range or inline elements, so we polyfill them.
const zeroDOMRect = () => ({
  x: 0,
  y: 0,
  width: 0,
  height: 0,
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
  toJSON: () => ({}),
});

if (typeof Range !== "undefined") {
  if (!Range.prototype.getClientRects) {
    Range.prototype.getClientRects = () => [];
  }
  if (!Range.prototype.getBoundingClientRect) {
    Range.prototype.getBoundingClientRect = zeroDOMRect;
  }
}

if (typeof HTMLElement !== "undefined" && !HTMLElement.prototype.getClientRects) {
  HTMLElement.prototype.getClientRects = () => [];
}

// ProseMirror calls window.scrollBy for scrollIntoView; JSDOM doesn't implement it.
if (typeof window !== "undefined" && !window.scrollBy) {
  window.scrollBy = () => {};
}
if (typeof window !== "undefined" && !window.scrollTo) {
  window.scrollTo = () => {};
}

if (typeof document !== "undefined" && !document.createRange) {
  document.createRange = () => ({
    setStart: () => {},
    setEnd: () => {},
    commonAncestorContainer: document.body,
    getClientRects: () => [],
    getBoundingClientRect: zeroDOMRect,
  });
}
