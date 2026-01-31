/**
 * Editor Text Transform Service
 * Maps text patterns to transformations using execCommand.
 * Operates on text content (not keystrokes) and preserves cursor position.
 */

import {
  saveCursorPosition,
  restoreCursorPosition,
  placeCursorAfterElement,
} from "./cursor";
import { TRANSFORMS, type TransformResult } from "./transforms";

export type { TextTransform, TransformResult } from "./transforms";
export type { CursorPosition } from "./cursor";

export interface TransformOutput {
  hrTransformed: boolean;
  linkifyTransformed: boolean;
}

/**
 * Apply all text transforms to the editor.
 * Preserves cursor position unless a transform explicitly moves it.
 */
export function applyTextTransforms(editor: HTMLElement): TransformOutput {
  const output: TransformOutput = {
    hrTransformed: false,
    linkifyTransformed: false,
  };

  let lastResult: TransformResult | null = null;

  for (const transform of TRANSFORMS) {
    if (transform.shouldTransform(editor)) {
      const result = transform.transform(editor);

      if (result.transformed) {
        lastResult = result;
        if (transform.name === "hr") {
          output.hrTransformed = true;
        } else if (transform.name === "linkify") {
          output.linkifyTransformed = true;
        }
      }
    }
  }

  // Only handle cursor restoration if a transform actually happened
  // This prevents interfering with browser's own cursor management (e.g., after execCommand)
  if (lastResult?.transformed) {
    // Save cursor position before restoration attempts
    const savedCursor = saveCursorPosition(editor);

    if (
      lastResult.cursorPlacement === "after-element" &&
      lastResult.targetSelector
    ) {
      const targetElement = editor.querySelector(lastResult.targetSelector);
      if (targetElement) {
        placeCursorAfterElement(targetElement);
      } else {
        restoreCursorPosition(editor, savedCursor);
      }
    } else if (lastResult.cursorPlacement === "restore") {
      restoreCursorPosition(editor, savedCursor);
    }
  }

  return output;
}

/**
 * Check if any transforms would apply without actually applying them.
 */
export function hasApplicableTransforms(editor: HTMLElement): boolean {
  return TRANSFORMS.some((t) => t.shouldTransform(editor));
}
