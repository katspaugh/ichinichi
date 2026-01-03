import { Node as ProseMirrorNode } from 'prosemirror-model';
import type { NodeView } from 'prosemirror-view';
import { EditorView } from 'prosemirror-view';

/**
 * NodeView for interactive checkboxes
 * Allows toggling checkbox state in both editable and read-only modes
 */
export class CheckboxNodeView implements NodeView {
  dom: HTMLInputElement;
  private view: EditorView;
  private getPos: () => number | undefined;
  
  constructor(
    node: ProseMirrorNode,
    view: EditorView,
    getPos: () => number | undefined
  ) {
    this.view = view;
    this.getPos = getPos;
    
    // Create the checkbox element
    this.dom = document.createElement('input');
    this.dom.type = 'checkbox';
    this.dom.checked = node.attrs.checked;
    
    // Handle checkbox toggle
    this.dom.addEventListener('change', this.handleChange);
  }
  
  private handleChange = () => {
    const pos = this.getPos();
    if (pos === undefined) return;
    
    const { state, dispatch } = this.view;
    const tr = state.tr.setNodeMarkup(pos, undefined, {
      checked: this.dom.checked
    });
    
    dispatch(tr);
  };
  
  update(node: ProseMirrorNode): boolean {
    if (node.type.name !== 'checkbox') {
      return false;
    }
    
    this.dom.checked = node.attrs.checked;
    return true;
  }
  
  destroy() {
    this.dom.removeEventListener('change', this.handleChange);
  }
  
  stopEvent(event: Event): boolean {
    // Allow checkbox clicks to be handled by our event listener
    return event.type === 'mousedown';
  }
  
  ignoreMutation(): boolean {
    return true;
  }
}
