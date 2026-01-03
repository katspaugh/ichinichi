import { Plugin } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';

/**
 * Plugin that shows a placeholder when the editor is empty
 */
export function createPlaceholderPlugin(placeholderText: string) {
  return new Plugin({
    props: {
      decorations(state) {
        const doc = state.doc;
        
        // Check if document is empty
        if (doc.childCount === 1 && 
            doc.firstChild?.isTextblock && 
            doc.firstChild.content.size === 0) {
          const placeholder = document.createElement('span');
          placeholder.className = 'ProseMirror-placeholder';
          placeholder.textContent = placeholderText;
          
          return DecorationSet.create(doc, [
            Decoration.widget(1, placeholder)
          ]);
        }
        
        return DecorationSet.empty;
      }
    }
  });
}
