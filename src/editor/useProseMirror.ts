import { useEffect, useRef, useState } from 'react';
import { EditorState, Plugin } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { history } from 'prosemirror-history';
import { parseHtmlToDoc, serializeDocToHtml } from './serializer';
import { createKeymap } from './plugins/keymap';
import { createPlaceholderPlugin } from './plugins/placeholder';
import { createAutoLinkPlugin } from './plugins/autoLink';
import { createHorizontalRulePlugin } from './plugins/horizontalRule';
import { createImageUploadPlugin } from './plugins/imageUpload';
import { ImageNodeView } from './nodeViews/ImageView';
import { CheckboxNodeView } from './nodeViews/CheckboxView';
import { ImageUrlManager } from '../utils/imageUrlManager';

interface UseProseMirrorOptions {
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
  imageUrlManager?: ImageUrlManager;
}

export function useProseMirror({
  content,
  isEditable,
  placeholderText,
  onChange,
  onUserInput,
  onImageDrop,
  onDropComplete,
  imageUrlManager
}: UseProseMirrorOptions) {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const onUserInputRef = useRef(onUserInput);
  const isLocalEditRef = useRef(false);
  const ownerIdRef = useRef<string>(`prosemirror-${Math.random().toString(36).slice(2)}`);
  const imageUrlManagerRef = useRef(imageUrlManager);
  
  // Track if content was set programmatically
  const [contentVersion, setContentVersion] = useState(0);
  
  useEffect(() => {
    onChangeRef.current = onChange;
    onUserInputRef.current = onUserInput;
    imageUrlManagerRef.current = imageUrlManager;
  }, [onChange, onUserInput, imageUrlManager]);
  
  // Initialize editor
  useEffect(() => {
    if (!editorRef.current) return;
    
    const plugins: Plugin[] = [
      history(),
      createKeymap(),
      createAutoLinkPlugin(),
      createHorizontalRulePlugin(),
      createPlaceholderPlugin(placeholderText),
      createImageUploadPlugin({
        onImageDrop,
        onDropComplete
      })
    ];
    
    const doc = parseHtmlToDoc(content || '<p></p>');
    
    const state = EditorState.create({
      doc,
      plugins
    });
    
    const currentImageUrlManager = imageUrlManagerRef.current;
    const ownerId = ownerIdRef.current!;
    
    const view = new EditorView(editorRef.current, {
      state,
      editable: () => isEditable,
      dispatchTransaction(transaction) {
        const newState = view.state.apply(transaction);
        view.updateState(newState);
        
        // Only trigger onChange if this was a document change (not just selection)
        if (transaction.docChanged) {
          const html = serializeDocToHtml(newState.doc);
          isLocalEditRef.current = true;
          onChangeRef.current(html);
          onUserInputRef.current?.();
        }
      },
      nodeViews: currentImageUrlManager ? {
        image: (node, view, getPos) => 
          new ImageNodeView(node, view, getPos, currentImageUrlManager, ownerId),
        checkbox: (node, view, getPos) =>
          new CheckboxNodeView(node, view, getPos)
      } : {
        checkbox: (node, view, getPos) =>
          new CheckboxNodeView(node, view, getPos)
      }
    });
    
    viewRef.current = view;
    
    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentVersion]);
  
  // Update content when it changes externally
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    
    // Skip update if this change came from local user input
    if (isLocalEditRef.current) {
      isLocalEditRef.current = false;
      return;
    }
    
    // Compare current document with new content
    const currentHtml = serializeDocToHtml(view.state.doc);
    
    // Simple comparison - if different, update the document
    if (currentHtml !== content) {
      const newDoc = parseHtmlToDoc(content || '<p></p>');
      const newState = EditorState.create({
        doc: newDoc,
        plugins: view.state.plugins
      });
      view.updateState(newState);
    }
  }, [content]);
  
  // Update editable state
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    
    // Force view update to reflect editable state
    view.setProps({ editable: () => isEditable });
  }, [isEditable]);
  
  // Update placeholder text
  useEffect(() => {
    // Recreate editor with new placeholder
    setContentVersion(v => v + 1);
  }, [placeholderText]);
  
  const focus = () => {
    viewRef.current?.focus();
  };
  
  return {
    editorRef,
    focus
  };
}
