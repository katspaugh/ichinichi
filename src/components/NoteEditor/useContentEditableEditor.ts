import { useCallback, useEffect, useRef } from 'react';
import type { ClipboardEvent, DragEvent } from 'react';

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
    const checkboxes = Array.from(container.querySelectorAll('input[type="checkbox"]'))
      .map((input) => (input as HTMLInputElement).checked ? '1' : '0');
    const links = Array.from(container.querySelectorAll('a[href]'))
      .map((anchor) => anchor.getAttribute('href') ?? '')
      .filter(Boolean);
    return JSON.stringify({ text, images, checkboxes, links });
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
    if (content === lastContentRef.current) {
      updateEmptyState();
      return;
    }
    el.innerHTML = content || '';
    lastContentRef.current = content || '';
    lastSignatureRef.current = getContentSignature(content || '');
    updateEmptyState();
  }, [content, getContentSignature, updateEmptyState]);

  const handleInput = useCallback(() => {
    if (!isEditableRef.current) return;
    const el = editorRef.current;
    if (!el) return;
    updateEmptyState();
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

  return {
    editorRef,
    handleInput,
    handlePaste,
    handleDrop,
    handleDragOver
  };
}
