import { useCallback, useEffect, useRef } from 'react';
import type { ClipboardEvent, DragEvent, MouseEvent } from 'react';
import { linkifyElement } from '../../utils/linkify';

const TIMESTAMP_ATTR = 'data-timestamp';
const TIMESTAMP_LABEL_ATTR = 'data-label';
const ADDITION_WINDOW_MS = 10 * 60 * 1000;

interface ContentEditableOptions {
  content: string;
  isEditable: boolean;
  placeholderText: string;
  onChange: (content: string) => void;
  onUserInput?: () => void;
  onImageDrop?: (file: File) => Promise<{
    id: string;
    width: number;
    height: number;
    filename: string;
  }>;
  onDropComplete?: () => void;
}

function setCaretFromPoint(x: number, y: number) {
  const selection = window.getSelection();
  if (!selection) return;

  let range: Range | null = null;
  if (document.caretRangeFromPoint) {
    range = document.caretRangeFromPoint(x, y);
  } else {
    const caretPositionFromPoint = (document as Document & {
      caretPositionFromPoint?: (x: number, y: number) => CaretPosition | null;
    }).caretPositionFromPoint;
    const position = caretPositionFromPoint?.(x, y);
    if (position) {
      range = document.createRange();
      range.setStart(position.offsetNode, position.offset);
      range.collapse(true);
    }
  }

  if (range) {
    selection.removeAllRanges();
    selection.addRange(range);
  }
}

function insertNodeAtCursor(node: Node) {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return;
  const range = selection.getRangeAt(0);
  range.deleteContents();
  range.insertNode(node);
  range.setStartAfter(node);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}

function saveCursorPosition(element: HTMLElement): { node: Node; offset: number } | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  if (!element.contains(range.startContainer)) return null;
  return { node: range.startContainer, offset: range.startOffset };
}

function restoreCursorPosition(
  element: HTMLElement,
  saved: { node: Node; offset: number } | null
) {
  if (!saved) return;
  const selection = window.getSelection();
  if (!selection) return;

  // If the saved node is still in the document, use it
  if (element.contains(saved.node)) {
    try {
      const range = document.createRange();
      range.setStart(saved.node, Math.min(saved.offset, saved.node.textContent?.length ?? 0));
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
    } catch {
      // If restoration fails, place cursor at end
      const range = document.createRange();
      range.selectNodeContents(element);
      range.collapse(false);
      selection.removeAllRanges();
      selection.addRange(range);
    }
  }
}

function placeCaretAtEnd(element: HTMLElement) {
  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();
  range.selectNodeContents(element);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

function formatTimestampLabel(timestamp: string): string {
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) return '';
  const time = parsed.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit'
  });
  return time;
}

function createTimestampHr(timestamp: string): HTMLHRElement {
  const hr = document.createElement('hr');
  hr.setAttribute(TIMESTAMP_ATTR, timestamp);
  const label = formatTimestampLabel(timestamp);
  if (label) {
    hr.setAttribute(TIMESTAMP_LABEL_ATTR, label);
  }
  hr.setAttribute('contenteditable', 'false');
  return hr;
}

function getLastEditTimestamp(element: HTMLElement): number | null {
  // Check for timestamp HR elements
  const hrs = Array.from(element.querySelectorAll<HTMLHRElement>(`hr[${TIMESTAMP_ATTR}]`));
  if (hrs.length === 0) return null;
  
  const timestamps = hrs
    .map(hr => Date.parse(hr.getAttribute(TIMESTAMP_ATTR) || ''))
    .filter(ts => !Number.isNaN(ts));
  
  if (timestamps.length === 0) return null;
  return Math.max(...timestamps);
}

export function useContentEditableEditor({
  content,
  isEditable,
  placeholderText,
  onChange,
  onUserInput,
  onImageDrop,
  onDropComplete
}: ContentEditableOptions) {
  const editorRef = useRef<HTMLDivElement>(null);
  const lastContentRef = useRef('');
  const isLocalEditRef = useRef(false);
  const isEditableRef = useRef(isEditable);
  const onChangeRef = useRef(onChange);
  const onUserInputRef = useRef(onUserInput);
  const onImageDropRef = useRef(onImageDrop);
  const onDropCompleteRef = useRef(onDropComplete);
  const lastUserInputRef = useRef<number | null>(null);
  const lastEditedBlockRef = useRef<Element | null>(null);
  const hasInsertedTimestampRef = useRef(false);
  const hasAutoFocusedRef = useRef(false);

  const insertTimestampHrIfNeeded = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    
    const range = selection.getRangeAt(0);
    
    // Find the block element containing the cursor
    let container = range.startContainer;
    if (container.nodeType === Node.TEXT_NODE) {
      container = container.parentNode as Node;
    }
    
    // Find the closest block-level element (p or div)
    let currentBlock: Element | null = null;
    let current: Node | null = container;
    while (current && current !== el) {
      if (current instanceof Element && 
          (current.tagName === 'P' || current.tagName === 'DIV')) {
        currentBlock = current;
        break;
      }
      current = current.parentNode;
    }

    if (!currentBlock && el.contains(container)) {
      currentBlock = el;
    }
    
    // If we're in a different block than last time (or first edit)
    if (currentBlock && currentBlock !== lastEditedBlockRef.current) {
      const now = Date.now();
      const lastEdit = getLastEditTimestamp(el);
      
      // Check if we need to insert a timestamp (>10min since last edit, or first edit)
      if (!hasInsertedTimestampRef.current && 
          (lastEdit === null || now - lastEdit > ADDITION_WINDOW_MS)) {
        const timestamp = new Date(now).toISOString();
        const hr = createTimestampHr(timestamp);
        
        if (currentBlock === el) {
          el.insertBefore(hr, el.firstChild);
        } else {
          // Insert before the current block element
          currentBlock.parentNode?.insertBefore(hr, currentBlock);
        }
        
        lastUserInputRef.current = now;
        hasInsertedTimestampRef.current = true;
      }
      
      lastEditedBlockRef.current = currentBlock;
    }
  }, []);

  const updateTimestampLabels = useCallback((element?: HTMLElement) => {
    const el = element ?? editorRef.current;
    if (!el) return;
    
    const hrs = Array.from(el.querySelectorAll<HTMLHRElement>(`hr[${TIMESTAMP_ATTR}]`));
    for (const hr of hrs) {
      const timestamp = hr.getAttribute(TIMESTAMP_ATTR);
      if (!timestamp) continue;
      
      const label = formatTimestampLabel(timestamp);
      if (label) {
        if (hr.getAttribute(TIMESTAMP_LABEL_ATTR) !== label) {
          hr.setAttribute(TIMESTAMP_LABEL_ATTR, label);
        }
      } else {
        hr.removeAttribute(TIMESTAMP_LABEL_ATTR);
      }
    }
  }, []);

  const updateEmptyState = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    const hasText = (el.textContent ?? '').trim().length > 0;
    const hasImages = el.querySelector('img') !== null;
    el.classList.toggle('is-empty', !hasText && !hasImages);
  }, []);

  useEffect(() => {
    isEditableRef.current = isEditable;
  }, [isEditable]);

  useEffect(() => {
    onChangeRef.current = onChange;
    onUserInputRef.current = onUserInput;
    onImageDropRef.current = onImageDrop;
    onDropCompleteRef.current = onDropComplete;
  }, [onChange, onUserInput, onImageDrop, onDropComplete]);

  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    el.setAttribute('data-placeholder', placeholderText);
  }, [placeholderText]);

  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    // Skip innerHTML update if this content change came from local user input
    // This prevents scroll jumps on mobile caused by re-setting innerHTML
    if (isLocalEditRef.current) {
      isLocalEditRef.current = false;
      lastContentRef.current = content || '';
      updateEmptyState();
      return;
    }
    if (content === lastContentRef.current) {
      updateEmptyState();
      updateTimestampLabels(el);
      return;
    }
    const nextContent = content || '';
    if (nextContent === el.innerHTML) {
      lastContentRef.current = nextContent;
      updateEmptyState();
      updateTimestampLabels(el);
      return;
    }
    el.innerHTML = nextContent;
    lastContentRef.current = nextContent;
    updateEmptyState();
    updateTimestampLabels(el);
  }, [content, updateEmptyState, updateTimestampLabels]);

  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    if (!isEditable) {
      hasAutoFocusedRef.current = false;
      return;
    }
    if (hasAutoFocusedRef.current) return;

    el.focus();
    const hasText = (el.textContent ?? '').trim().length > 0;
    const hasImages = el.querySelector('img') !== null;
    if (hasText || hasImages) {
      placeCaretAtEnd(el);
    }
    hasAutoFocusedRef.current = true;
  }, [content, isEditable]);

  const handleInput = useCallback(() => {
    if (!isEditableRef.current) return;
    const el = editorRef.current;
    if (!el) return;
    
    // Check if we should insert a timestamp for this edit
    insertTimestampHrIfNeeded();
    
    // Track last user input time
    const now = Date.now();
    if (lastUserInputRef.current && now - lastUserInputRef.current > ADDITION_WINDOW_MS) {
      // More than 10 minutes passed, allow inserting timestamp on next block change
      hasInsertedTimestampRef.current = false;
    }
    lastUserInputRef.current = now;
    
    updateEmptyState();

    // Convert --- to timestamped <hr>
    const hrPattern = /^---$/;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const textNodesToReplace: Text[] = [];
    let node;
    while ((node = walker.nextNode())) {
      const text = (node.textContent ?? '').trim();
      if (hrPattern.test(text)) {
        textNodesToReplace.push(node as Text);
      }
    }
    for (const textNode of textNodesToReplace) {
      const timestamp = new Date().toISOString();
      const hr = createTimestampHr(timestamp);
      const br = document.createElement('br');
      const parent = textNode.parentNode;
      if (parent) {
        parent.replaceChild(hr, textNode);
        hr.after(br);
      }
    }

    // Linkify any URLs in text nodes
    const cursorPos = saveCursorPosition(el);
    const didLinkify = linkifyElement(el);
    const didInsertHr = textNodesToReplace.length > 0;
    if (didLinkify || didInsertHr) {
      // After transformation, cursor may be lost - place it after the new element
      const selection = window.getSelection();
      if (selection) {
        if (didInsertHr) {
          // Place cursor after the last timestamp HR
          const hrs = el.querySelectorAll(`hr[${TIMESTAMP_ATTR}]`);
          if (hrs.length > 0) {
            const lastHr = hrs[hrs.length - 1];
            const range = document.createRange();
            range.setStartAfter(lastHr);
            range.collapse(true);
            selection.removeAllRanges();
            selection.addRange(range);
          }
        } else if (didLinkify) {
          // Find the last anchor and place cursor after it
          const anchors = el.querySelectorAll('a');
          if (anchors.length > 0) {
            const lastAnchor = anchors[anchors.length - 1];
            const range = document.createRange();
            range.setStartAfter(lastAnchor);
            range.collapse(true);
            selection.removeAllRanges();
            selection.addRange(range);
          } else {
            restoreCursorPosition(el, cursorPos);
          }
        }
      }
    }

    const hasText = (el.textContent ?? '').trim().length > 0;
    const hasImages = el.querySelector('img') !== null;
    const html = hasText || hasImages ? el.innerHTML : '';
    if (html === lastContentRef.current) {
      return;
    }
    lastContentRef.current = html;
    isLocalEditRef.current = true;
    updateTimestampLabels(el);
    onChangeRef.current(html);
    onUserInputRef.current?.();
  }, [insertTimestampHrIfNeeded, updateEmptyState, updateTimestampLabels]);

  const handlePaste = useCallback((event: ClipboardEvent<HTMLDivElement>) => {
    if (!isEditableRef.current) return;
    const dropHandler = onImageDropRef.current;
    if (!dropHandler || !event.clipboardData) return;

    const items = Array.from(event.clipboardData.items);
    const imageItem = items.find((item) => item.type.startsWith('image/'));
    if (!imageItem) return;

    const file = imageItem.getAsFile();
    if (!file) return;

    event.preventDefault();

    const placeholder = document.createElement('img');
    placeholder.setAttribute('data-image-id', 'uploading');
    placeholder.setAttribute('alt', 'Uploading...');
    insertNodeAtCursor(placeholder);
    handleInput();

    dropHandler(file)
      .then(({ id, width, height, filename }) => {
        placeholder.setAttribute('data-image-id', id);
        placeholder.setAttribute('alt', filename);
        placeholder.setAttribute('width', String(width));
        placeholder.setAttribute('height', String(height));
      })
      .catch((error) => {
        console.error('Failed to upload pasted image:', error);
        placeholder.remove();
      })
      .finally(() => {
        onDropCompleteRef.current?.();
        updateEmptyState();
        handleInput();
      });
  }, [handleInput, updateEmptyState]);

  const handleDrop = useCallback((event: DragEvent<HTMLDivElement>) => {
    if (!isEditableRef.current) return;
    const dropHandler = onImageDropRef.current;
    const files = event.dataTransfer?.files;
    if (!dropHandler || !files || files.length === 0) return;

    const file = files[0];
    if (!file.type.startsWith('image/')) return;

    event.preventDefault();
    setCaretFromPoint(event.clientX, event.clientY);

    const placeholder = document.createElement('img');
    placeholder.setAttribute('data-image-id', 'uploading');
    placeholder.setAttribute('alt', 'Uploading...');
    insertNodeAtCursor(placeholder);
    handleInput();

    dropHandler(file)
      .then(({ id, width, height, filename }) => {
        placeholder.setAttribute('data-image-id', id);
        placeholder.setAttribute('alt', filename);
        placeholder.setAttribute('width', String(width));
        placeholder.setAttribute('height', String(height));
      })
      .catch((error) => {
        console.error('Failed to upload dropped image:', error);
        placeholder.remove();
      })
      .finally(() => {
        onDropCompleteRef.current?.();
        updateEmptyState();
        handleInput();
      });
  }, [handleInput, updateEmptyState]);

  const handleDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    if (!isEditableRef.current) return;
    if (!onImageDropRef.current) return;
    if (event.dataTransfer?.types?.includes('Files')) {
      event.preventDefault();
    }
  }, []);

  const handleClick = useCallback((event: MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    const anchor = target.closest('a');
    if (anchor && anchor.href) {
      event.preventDefault();
      window.open(anchor.href, '_blank', 'noopener,noreferrer');
    }
  }, []);

  return {
    editorRef,
    handleInput,
    handlePaste,
    handleDrop,
    handleDragOver,
    handleClick
  };
}
