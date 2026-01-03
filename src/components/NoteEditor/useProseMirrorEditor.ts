import { useEffect, useMemo, useRef } from 'react';
import { EditorState, Plugin } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import type { MarkType, Node as PMNode } from 'prosemirror-model';
import {
  DOMParser as PMDOMParser,
  DOMSerializer,
  Schema
} from 'prosemirror-model';
import { inputRules, InputRule, textblockTypeInputRule } from 'prosemirror-inputrules';
import { history } from 'prosemirror-history';
import { keymap } from 'prosemirror-keymap';
import { baseKeymap, toggleMark } from 'prosemirror-commands';

interface ProseMirrorOptions {
  content: string;
  isEditable: boolean;
  isEnabled?: boolean;
  placeholderText: string;
  onChange: (content: string) => void;
  onUserInput?: () => void;
  onImageDrop?: (file: File) => Promise<{
    id: string;
    width: number;
    height: number;
    filename: string;
  }>;
  isDraggingImage?: boolean;
  onDropComplete?: () => void;
}

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: {
      content: 'inline*',
      group: 'block',
      parseDOM: [{ tag: 'p' }, { tag: 'div' }],
      toDOM: () => ['p', 0]
    },
    heading: {
      attrs: { level: { default: 1 } },
      content: 'inline*',
      group: 'block',
      defining: true,
      parseDOM: [
        { tag: 'h1', attrs: { level: 1 } },
        { tag: 'h2', attrs: { level: 2 } },
        { tag: 'h3', attrs: { level: 3 } },
        { tag: 'h4', attrs: { level: 4 } },
        { tag: 'h5', attrs: { level: 5 } },
        { tag: 'h6', attrs: { level: 6 } }
      ],
      toDOM: (node) => [`h${node.attrs.level}`, 0]
    },
    image: {
      inline: false,
      group: 'block',
      draggable: true,
      attrs: {
        'data-image-id': {},
        alt: { default: null },
        width: { default: null },
        height: { default: null }
      },
      parseDOM: [
        {
          tag: 'img[data-image-id]',
          getAttrs: (dom) => {
            if (!(dom instanceof HTMLElement)) return false;
            return {
              'data-image-id': dom.getAttribute('data-image-id') ?? '',
              alt: dom.getAttribute('alt'),
              width: dom.getAttribute('width'),
              height: dom.getAttribute('height')
            };
          }
        }
      ],
      toDOM: (node) => [
        'img',
        {
          'data-image-id': node.attrs['data-image-id'],
          alt: node.attrs.alt ?? '',
          width: node.attrs.width ?? undefined,
          height: node.attrs.height ?? undefined
        }
      ]
    },
    link: {
      inline: true,
      group: 'inline',
      atom: true,
      selectable: false,
      attrs: {
        href: {},
        text: {}
      },
      parseDOM: [
        {
          tag: 'a[href]',
          getAttrs: (dom) => {
            if (!(dom instanceof HTMLElement)) return false;
            const href = dom.getAttribute('href') ?? '';
            return { href, text: dom.textContent ?? href };
          }
        }
      ],
      toDOM: (node) => [
        'a',
        {
          href: node.attrs.href,
          target: '_blank',
          rel: 'noopener noreferrer',
          contenteditable: 'false'
        },
        node.attrs.text
      ]
    },
    text: { group: 'inline' },
    hard_break: {
      inline: true,
      group: 'inline',
      selectable: false,
      parseDOM: [{ tag: 'br' }],
      toDOM: () => ['br']
    }
  },
  marks: {
    strong: {
      parseDOM: [
        { tag: 'strong' },
        {
          tag: 'b',
          getAttrs: (node) => (node instanceof HTMLElement && node.style.fontWeight !== 'normal') ? null : false
        }
      ],
      toDOM: () => ['strong', 0]
    },
    em: {
      parseDOM: [{ tag: 'em' }, { tag: 'i' }],
      toDOM: () => ['em', 0]
    },
    code: {
      parseDOM: [{ tag: 'code' }],
      toDOM: () => ['code', 0]
    }
  }
});

function parseHtmlToDoc(html: string): PMNode {
  const parser = PMDOMParser.fromSchema(schema);
  const container = document.createElement('div');
  container.innerHTML = html || '<p></p>';
  return parser.parse(container);
}

function serializeDocToHtml(state: EditorState): string {
  const serializer = DOMSerializer.fromSchema(schema);
  const container = document.createElement('div');
  const fragment = serializer.serializeFragment(state.doc.content);
  container.appendChild(fragment);
  return container.innerHTML;
}

function isDocEmpty(doc: PMNode): boolean {
  let hasContent = false;
  doc.descendants((node) => {
    if (node.isText && node.text?.trim()) {
      hasContent = true;
      return false;
    }
    if (node.type.name === 'image' || node.type.name === 'link') {
      hasContent = true;
      return false;
    }
    return !hasContent;
  });
  return !hasContent;
}

function markInputRule(
  regexp: RegExp,
  markType: MarkType,
  getAttrs?: ((match: RegExpMatchArray) => Record<string, string>) | Record<string, string>
) {
  return new InputRule(regexp, (state, match, start, end) => {
    const attrs = typeof getAttrs === 'function' ? getAttrs(match) : getAttrs;
    const captured = match[1];
    if (!captured) return null;

    const textStart = start + match[0].indexOf(captured);
    const textEnd = textStart + captured.length;
    if (textEnd < textStart) return null;

    const tr = state.tr;
    if (textEnd < end) {
      tr.delete(textEnd, end);
      tr.delete(start, textStart);
    } else {
      tr.delete(start, textStart);
      tr.delete(textEnd, end);
    }
    tr.addMark(textStart, textEnd, markType.create(attrs));
    tr.removeStoredMark(markType);
    return tr;
  });
}

function normalizeClipboardText(text: string): string {
  return text.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

function isSingleUrl(text: string): boolean {
  const normalized = normalizeClipboardText(text);
  return /^https?:\/\/\S+$/.test(normalized);
}

export function useProseMirrorEditor({
  content,
  isEditable,
  isEnabled = true,
  placeholderText,
  onChange,
  onUserInput,
  onImageDrop,
  onDropComplete
}: ProseMirrorOptions) {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const lastContentRef = useRef('');
  const isEditableRef = useRef(isEditable);
  const placeholderRef = useRef(placeholderText);
  const onChangeRef = useRef(onChange);
  const onUserInputRef = useRef(onUserInput);
  const onImageDropRef = useRef(onImageDrop);
  const onDropCompleteRef = useRef(onDropComplete);

  const placeholderPlugin = useMemo(() => new Plugin({
    view(view) {
      const update = () => {
        view.dom.classList.toggle('is-empty', isDocEmpty(view.state.doc));
      };
      update();
      return { update };
    }
  }), []);

  const plugins = useMemo(() => {
    const rules = [
      textblockTypeInputRule(
        /^(#{1,6})\s$/,
        schema.nodes.heading,
        (match) => ({ level: match[1].length })
      ),
      markInputRule(/\*\*([^*]+)\*\*$/, schema.marks.strong),
      markInputRule(/__([^_]+)__$/, schema.marks.strong),
      markInputRule(/\*([^*]+)\*$/, schema.marks.em),
      markInputRule(/_([^_]+)_$/, schema.marks.em),
      markInputRule(/`([^`]+)`$/, schema.marks.code)
    ];

    return [
      inputRules({ rules }),
      history(),
      keymap({
        'Shift-Enter': (state, dispatch) => {
          if (!dispatch) return true;
          const hardBreak = schema.nodes.hard_break.create();
          dispatch(state.tr.replaceSelectionWith(hardBreak).scrollIntoView());
          return true;
        },
        'Mod-b': toggleMark(schema.marks.strong),
        'Mod-i': toggleMark(schema.marks.em),
        'Mod-`': toggleMark(schema.marks.code)
      }),
      keymap(baseKeymap),
      placeholderPlugin
    ];
  }, [placeholderPlugin]);

  useEffect(() => {
    isEditableRef.current = isEditable;
  }, [isEditable]);

  useEffect(() => {
    placeholderRef.current = placeholderText;
  }, [placeholderText]);

  useEffect(() => {
    onChangeRef.current = onChange;
    onUserInputRef.current = onUserInput;
    onImageDropRef.current = onImageDrop;
    onDropCompleteRef.current = onDropComplete;
  }, [onChange, onUserInput, onImageDrop, onDropComplete]);

  useEffect(() => {
    if (!isEnabled) {
      if (viewRef.current) {
        viewRef.current.destroy();
        viewRef.current = null;
      }
      return;
    }

    if (!editorRef.current || viewRef.current) return;

    const doc = parseHtmlToDoc(content);
    const state = EditorState.create({ doc, plugins });
    const view = new EditorView(editorRef.current, {
      state,
      editable: () => isEditableRef.current,
      dispatchTransaction: (tr) => {
        const nextState = view.state.apply(tr);
        view.updateState(nextState);
        if (tr.docChanged) {
          const html = serializeDocToHtml(nextState);
          lastContentRef.current = html;
          onChangeRef.current(html);
          onUserInputRef.current?.();
        }
      },
      handlePaste: (view, event) => {
        if (!event.clipboardData) return false;

        const items = Array.from(event.clipboardData.items);
        const imageItem = items.find((item) => item.type.startsWith('image/'));
        const dropHandler = onImageDropRef.current;
        if (imageItem && dropHandler) {
          const file = imageItem.getAsFile();
          if (file) {
            event.preventDefault();
            const placeholder = schema.nodes.image.create({
              'data-image-id': 'uploading',
              alt: 'Uploading...'
            });
            const tr = view.state.tr.replaceSelectionWith(placeholder);
            view.dispatch(tr);
            onUserInputRef.current?.();

            dropHandler(file)
              .then(({ id, width, height, filename }) => {
                const pos = findImagePos(view.state, 'uploading');
                if (pos !== null) {
                  const updated = view.state.tr.setNodeMarkup(pos, undefined, {
                    'data-image-id': id,
                    alt: filename,
                    width,
                    height
                  });
                  view.dispatch(updated);
                }
              })
              .catch((error) => {
                console.error('Failed to upload pasted image:', error);
                const pos = findImagePos(view.state, 'uploading');
                if (pos !== null) {
                  view.dispatch(view.state.tr.delete(pos, pos + 1));
                }
              })
              .finally(() => {
                onDropCompleteRef.current?.();
              });
            return true;
          }
        }

        const html = event.clipboardData.getData('text/html');
        const text = event.clipboardData.getData('text/plain');
        const htmlText = html ? (new DOMParser().parseFromString(html, 'text/html').body.textContent ?? '') : '';
        const candidateText = text || htmlText;
        const normalizedCandidate = candidateText ? normalizeClipboardText(candidateText) : '';
        if (normalizedCandidate && isSingleUrl(normalizedCandidate)) {
          event.preventDefault();
          const linkNode = schema.nodes.link.create({
            href: normalizedCandidate,
            text: normalizedCandidate
          });
          view.dispatch(view.state.tr.replaceSelectionWith(linkNode));
          onUserInputRef.current?.();
          return true;
        }

        return false;
      },
      handleDrop: (view, event) => {
        const dropHandler = onImageDropRef.current;
        if (!dropHandler) return false;
        const files = event.dataTransfer?.files;
        if (!files || files.length === 0) return false;
        const file = files[0];
        if (!file.type.startsWith('image/')) return false;

        event.preventDefault();
        const coords = { left: event.clientX, top: event.clientY };
        const pos = view.posAtCoords(coords);
        if (pos) {
          const placeholder = schema.nodes.image.create({
            'data-image-id': 'uploading',
            alt: 'Uploading...'
          });
          const tr = view.state.tr.insert(pos.pos, placeholder);
          view.dispatch(tr);
        }
        onUserInputRef.current?.();

        dropHandler(file)
          .then(({ id, width, height, filename }) => {
            const imagePos = findImagePos(view.state, 'uploading');
            if (imagePos !== null) {
              const updated = view.state.tr.setNodeMarkup(imagePos, undefined, {
                'data-image-id': id,
                alt: filename,
                width,
                height
              });
              view.dispatch(updated);
            }
          })
          .catch((error) => {
            console.error('Failed to upload dropped image:', error);
            const imagePos = findImagePos(view.state, 'uploading');
            if (imagePos !== null) {
              view.dispatch(view.state.tr.delete(imagePos, imagePos + 1));
            }
          })
          .finally(() => {
            onDropCompleteRef.current?.();
          });

        return true;
      }
    });

    view.dom.setAttribute('data-placeholder', placeholderRef.current);
    lastContentRef.current = content;
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [plugins, isEnabled, content]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dom.setAttribute('data-placeholder', placeholderText);
  }, [placeholderText]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    if (content === lastContentRef.current) return;
    const doc = parseHtmlToDoc(content);
    const nextState = EditorState.create({ doc, plugins });
    view.updateState(nextState);
    lastContentRef.current = content;
  }, [content, plugins]);

  return {
    editorRef
  };
}

function findImagePos(state: EditorState, imageId: string): number | null {
  let found: number | null = null;
  state.doc.descendants((node, pos) => {
    if (node.type.name === 'image' && node.attrs['data-image-id'] === imageId) {
      found = pos;
      return false;
    }
    return true;
  });
  return found;
}
