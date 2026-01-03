import { useCallback, useEffect, useRef } from 'react';
import type { ClipboardEvent, DragEvent, KeyboardEvent, MouseEvent } from 'react';
import { linkifyElement } from '../../utils/linkify';

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
  const lastSignatureRef = useRef('');
  const isLocalEditRef = useRef(false);
  const isEditableRef = useRef(isEditable);
  const onChangeRef = useRef(onChange);
  const onUserInputRef = useRef(onUserInput);
  const onImageDropRef = useRef(onImageDrop);
  const onDropCompleteRef = useRef(onDropComplete);

  const getContentSignature = useCallback((html: string) => {
    const container = document.createElement('div');
    container.innerHTML = html;
    const text = (container.textContent ?? '')
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      .replace(/\u00a0/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const images = Array.from(container.querySelectorAll('img[data-image-id]'))
      .map((img) => img.getAttribute('data-image-id') ?? '')
      .filter(Boolean);
    const links = Array.from(container.querySelectorAll('a[href]'))
      .map((anchor) => anchor.getAttribute('href') ?? '')
      .filter(Boolean);
    return JSON.stringify({ text, images, links });
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
      lastSignatureRef.current = getContentSignature(content || '');
      updateEmptyState();
      return;
    }
    if (content === lastContentRef.current) {
      updateEmptyState();
      return;
    }
    // Compare signatures to handle HTML normalization differences
    // Skip if DOM already has semantically equivalent content
    const newSignature = getContentSignature(content || '');
    const currentSignature = getContentSignature(el.innerHTML);
    if (newSignature === currentSignature) {
      lastContentRef.current = content || '';
      lastSignatureRef.current = newSignature;
      updateEmptyState();
      return;
    }
    el.innerHTML = content || '';
    lastContentRef.current = content || '';
    lastSignatureRef.current = newSignature;
    updateEmptyState();
  }, [content, getContentSignature, updateEmptyState]);

  const handleInput = useCallback(() => {
    if (!isEditableRef.current) return;
    const el = editorRef.current;
    if (!el) return;
    updateEmptyState();

    // Convert --- to <hr>
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
      const hr = document.createElement('hr');
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
          // Place cursor after the <br> following the last <hr>
          const hrs = el.querySelectorAll('hr');
          if (hrs.length > 0) {
            const lastHr = hrs[hrs.length - 1];
            const nextSibling = lastHr.nextSibling;
            const range = document.createRange();
            if (nextSibling) {
              range.setStartAfter(nextSibling);
            } else {
              range.setStartAfter(lastHr);
            }
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
    const signature = getContentSignature(html);
    if (signature === lastSignatureRef.current) {
      lastContentRef.current = html;
      return;
    }
    lastSignatureRef.current = signature;
    lastContentRef.current = html;
    isLocalEditRef.current = true;
    onChangeRef.current(html);
    onUserInputRef.current?.();
  }, [getContentSignature, updateEmptyState]);

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

  const handleKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    if (!isEditableRef.current) return;

    // Cmd+Shift+X (Mac) or Ctrl+Shift+X (Windows/Linux) for strikethrough
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    const modifierKey = isMac ? event.metaKey : event.ctrlKey;

    if (modifierKey && event.shiftKey && event.key.toLowerCase() === 'x') {
      event.preventDefault();
      document.execCommand('strikeThrough', false);
      handleInput();
    }
  }, [handleInput]);

  return {
    editorRef,
    handleInput,
    handlePaste,
    handleDrop,
    handleDragOver,
    handleClick,
    handleKeyDown
  };
}
