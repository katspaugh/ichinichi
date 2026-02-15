/**
 * DOM utilities for text transformations.
 */

/**
 * Check if a node is inside an anchor element.
 */
export function isInsideAnchor(node: Node): boolean {
  let current: Node | null = node;
  while (current) {
    if (current.nodeName === "A") {
      return true;
    }
    current = current.parentNode;
  }
  return false;
}

/**
 * Find all text nodes in an element matching a pattern.
 */
export function findTextNodesMatching(
  element: HTMLElement,
  pattern: RegExp,
  filter?: (node: Node) => boolean,
): Text[] {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      if (filter && !filter(node)) {
        return NodeFilter.FILTER_REJECT;
      }
      const text = node.textContent ?? "";
      return pattern.test(text)
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_REJECT;
    },
  });

  const nodes: Text[] = [];
  let node;
  while ((node = walker.nextNode())) {
    nodes.push(node as Text);
  }
  return nodes;
}

/**
 * Select a text node's contents and execute a command.
 */
export function selectNodeAndExecCommand(
  textNode: Text,
  command: string,
  value?: string,
): boolean {
  const selection = window.getSelection();
  if (!selection) return false;

  const range = document.createRange();
  range.selectNodeContents(textNode);
  selection.removeAllRanges();
  selection.addRange(range);

  return document.execCommand(command, false, value);
}

/**
 * Select a range within a text node and execute a command.
 */
export function selectRangeAndExecCommand(
  textNode: Text,
  start: number,
  end: number,
  command: string,
  value?: string,
): boolean {
  const selection = window.getSelection();
  if (!selection) return false;

  const range = document.createRange();
  try {
    range.setStart(textNode, start);
    range.setEnd(textNode, end);
  } catch {
    return false;
  }

  selection.removeAllRanges();
  selection.addRange(range);

  return document.execCommand(command, false, value);
}
