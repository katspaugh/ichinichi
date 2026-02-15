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
