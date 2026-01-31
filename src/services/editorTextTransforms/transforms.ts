/**
 * Text transform registry.
 * Pure pattern-to-action mappings for text transformations.
 */

import { findUrls, normalizeUrl } from "../../utils/linkify";
import {
  findTextNodesMatching,
  isInsideAnchor,
  selectNodeAndExecCommand,
  selectRangeAndExecCommand,
} from "./dom";
import {
  getTimestampLabel,
  markHrWeatherPending,
} from "../weatherLabel";

const TIMESTAMP_ATTR = "data-timestamp";
const TIMESTAMP_LABEL_ATTR = "data-label";

// Only match URLs followed by whitespace (not end of string - user may still be typing)
const URL_PATTERN = /(?:https?:\/\/|www\.)[^\s<>"']+(?=\s)/gi;
const HR_PATTERN = /^\s*(---|—-)\s*$/;

export interface TransformResult {
  transformed: boolean;
  cursorPlacement?: "after-element" | "restore";
  targetSelector?: string;
  needsWeatherUpdate?: boolean;
}

export interface TextTransform {
  name: string;
  description: string;
  shouldTransform: (editor: HTMLElement) => boolean;
  transform: (editor: HTMLElement) => TransformResult;
}

function addTimestampToHr(hr: HTMLHRElement): { needsWeatherUpdate: boolean } {
  const timestamp = new Date().toISOString();
  hr.setAttribute(TIMESTAMP_ATTR, timestamp);

  const { label, needsWeatherUpdate } = getTimestampLabel(timestamp);
  if (label) {
    hr.setAttribute(TIMESTAMP_LABEL_ATTR, label);
  }
  if (needsWeatherUpdate) {
    markHrWeatherPending(hr);
  }

  hr.setAttribute("contenteditable", "false");
  return { needsWeatherUpdate };
}

function findAndTimestampNewHr(editor: HTMLElement): { needsWeatherUpdate: boolean } {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return { needsWeatherUpdate: false };

  const currentRange = selection.getRangeAt(0);
  let searchNode: Node | null = currentRange.startContainer;

  while (searchNode && searchNode !== editor) {
    if (searchNode.nodeType === Node.ELEMENT_NODE) {
      const element = searchNode as Element;
      let sibling = element.previousSibling;
      while (sibling) {
        if (sibling.nodeName === "HR") {
          return addTimestampToHr(sibling as HTMLHRElement);
        }
        sibling = sibling.previousSibling;
      }
    }
    searchNode = searchNode.parentNode;
  }

  // Fallback: find the last HR without timestamp
  const hrs = editor.querySelectorAll(`hr:not([${TIMESTAMP_ATTR}])`);
  if (hrs.length > 0) {
    return addTimestampToHr(hrs[hrs.length - 1] as HTMLHRElement);
  }

  return { needsWeatherUpdate: false };
}

/**
 * HR Transform: Convert --- or —- (mobile emdash) to timestamped horizontal rule
 */
export const hrTransform: TextTransform = {
  name: "hr",
  description: "Convert --- to horizontal rule",

  shouldTransform(editor: HTMLElement): boolean {
    const nodes = findTextNodesMatching(editor, HR_PATTERN);
    return nodes.length > 0;
  },

  transform(editor: HTMLElement): TransformResult {
    const nodes = findTextNodesMatching(editor, HR_PATTERN);

    if (nodes.length === 0) {
      return { transformed: false };
    }

    let lastInsertedElement: Element | null = null;
    let needsWeatherUpdate = false;

    for (const textNode of nodes) {
      selectNodeAndExecCommand(textNode, "insertHorizontalRule");
      const result = findAndTimestampNewHr(editor);
      if (result.needsWeatherUpdate) {
        needsWeatherUpdate = true;
      }

      // Ensure there's a newline after the HR
      const hrs = editor.querySelectorAll<HTMLHRElement>(
        `hr[${TIMESTAMP_ATTR}]:last-of-type`,
      );
      if (hrs.length > 0) {
        const hr = hrs[hrs.length - 1];
        const nextSibling = hr.nextSibling;

        // If there's no next sibling or it's another HR, add a line break
        if (
          !nextSibling ||
          (nextSibling.nodeType === Node.ELEMENT_NODE &&
            nextSibling.nodeName === "HR")
        ) {
          const br = document.createElement("br");
          hr.parentNode?.insertBefore(br, nextSibling || null);
          lastInsertedElement = br;
        } else {
          lastInsertedElement = hr;
        }
      }
    }

    // Place cursor after the last inserted element (either br or hr)
    if (lastInsertedElement) {
      const selection = window.getSelection();
      if (selection) {
        const range = document.createRange();
        range.setStartAfter(lastInsertedElement);
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
      }
    }

    return {
      transformed: true,
      cursorPlacement: "restore", // We already placed the cursor above
      needsWeatherUpdate,
    };
  },
};

/**
 * Linkify Transform: Convert URLs followed by whitespace to anchor tags
 */
export const linkifyTransform: TextTransform = {
  name: "linkify",
  description: "Convert URLs to links",

  shouldTransform(editor: HTMLElement): boolean {
    const pattern = new RegExp(URL_PATTERN.source, "gi");
    const nodes = findTextNodesMatching(
      editor,
      pattern,
      (node) => !isInsideAnchor(node),
    );
    return nodes.length > 0;
  },

  transform(editor: HTMLElement): TransformResult {
    const pattern = new RegExp(URL_PATTERN.source, "gi");
    const textNodes = findTextNodesMatching(
      editor,
      pattern,
      (node) => !isInsideAnchor(node),
    );

    if (textNodes.length === 0) {
      return { transformed: false };
    }

    const nodesToProcess: {
      node: Text;
      urls: Array<{ url: string; start: number; end: number }>;
    }[] = [];

    for (const node of textNodes) {
      const text = node.textContent ?? "";
      const urls = findUrls(text);
      if (urls.length > 0) {
        nodesToProcess.push({ node, urls });
      }
    }

    if (nodesToProcess.length === 0) {
      return { transformed: false };
    }

    const selection = window.getSelection();
    if (!selection) {
      return { transformed: false };
    }

    // Process URLs in reverse order to maintain correct positions
    for (const { node: textNode, urls } of nodesToProcess) {
      for (let i = urls.length - 1; i >= 0; i--) {
        const { url, start, end } = urls[i];
        const normalizedUrl = normalizeUrl(url);

        selectRangeAndExecCommand(
          textNode,
          start,
          end,
          "createLink",
          normalizedUrl,
        );

        // Set target and rel attributes on the newly created link
        const anchor = selection.anchorNode?.parentElement;
        if (anchor?.tagName === "A") {
          anchor.setAttribute("target", "_blank");
          anchor.setAttribute("rel", "noopener noreferrer");
        }
      }
    }

    return {
      transformed: true,
      cursorPlacement: "restore",
    };
  },
};

/**
 * Registry of all text transforms.
 * Order matters: transforms are applied in sequence.
 */
export const TRANSFORMS: TextTransform[] = [hrTransform, linkifyTransform];
