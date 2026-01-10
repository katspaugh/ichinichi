/**
 * URL pattern that matches common URLs followed by whitespace.
 * Only linkifies "complete" URLs (when user has finished typing by pressing space/enter).
 * Does NOT match URLs at end of string - user may still be typing.
 * Matches http://, https://, and www. prefixed URLs.
 */
const URL_PATTERN = /(?:https?:\/\/|www\.)[^\s<>"']+(?=\s)/gi;

/**
 * Checks if a string looks like a URL
 */
export function isUrl(text: string): boolean {
  const pattern = new RegExp(URL_PATTERN.source, "gi");
  return pattern.test(text);
}

/**
 * Finds URL matches in text and returns their positions.
 * Only matches URLs that are followed by whitespace or end of string.
 */
export function findUrls(
  text: string,
): Array<{ url: string; start: number; end: number }> {
  const matches: Array<{ url: string; start: number; end: number }> = [];
  const pattern = new RegExp(URL_PATTERN.source, "gi");
  let match;

  while ((match = pattern.exec(text)) !== null) {
    matches.push({
      url: match[0],
      start: match.index,
      end: match.index + match[0].length,
    });
  }

  return matches;
}

/**
 * Normalizes a URL by adding https:// if it starts with www.
 */
export function normalizeUrl(url: string): string {
  if (url.startsWith("www.")) {
    return `https://${url}`;
  }
  return url;
}

/**
 * Checks if a node is inside an anchor element
 */
function isInsideAnchor(node: Node): boolean {
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
 * Linkifies URLs in the editor using execCommand('createLink').
 * Finds URLs followed by whitespace and converts them to links.
 * Returns true if any URLs were linkified.
 */
export function linkifyElement(element: HTMLElement): boolean {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      // Skip if inside an anchor
      if (isInsideAnchor(node)) {
        return NodeFilter.FILTER_REJECT;
      }
      // Skip if no URLs in text
      const text = node.textContent ?? "";
      const pattern = new RegExp(URL_PATTERN.source, "gi");
      if (!pattern.test(text)) {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  const nodesToProcess: {
    node: Text;
    urls: Array<{ url: string; start: number; end: number }>;
  }[] = [];
  let node;
  while ((node = walker.nextNode())) {
    const text = (node as Text).textContent ?? "";
    const urls = findUrls(text);
    if (urls.length > 0) {
      nodesToProcess.push({ node: node as Text, urls });
    }
  }

  if (nodesToProcess.length === 0) {
    return false;
  }

  const selection = window.getSelection();
  if (!selection) {
    return false;
  }

  // Process URLs in reverse order to maintain correct positions
  for (const { node: textNode, urls } of nodesToProcess) {
    for (let i = urls.length - 1; i >= 0; i--) {
      const { url, start, end } = urls[i];

      // Create a range selecting the URL text
      const range = document.createRange();
      try {
        range.setStart(textNode, start);
        range.setEnd(textNode, end);
      } catch {
        // Text node may have changed, skip
        continue;
      }

      // Select the URL text
      selection.removeAllRanges();
      selection.addRange(range);

      // Create the link using execCommand
      const normalizedUrl = normalizeUrl(url);
      document.execCommand("createLink", false, normalizedUrl);

      // Set target and rel attributes on the newly created link
      const anchor = selection.anchorNode?.parentElement;
      if (anchor?.tagName === "A") {
        anchor.setAttribute("target", "_blank");
        anchor.setAttribute("rel", "noopener noreferrer");
      }
    }
  }

  return true;
}
