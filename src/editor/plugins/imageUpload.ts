import { Plugin, PluginKey } from 'prosemirror-state';
import { schema } from '../schema';

export const imageUploadPluginKey = new PluginKey('imageUpload');

interface ImageUploadOptions {
  onImageDrop?: (file: File) => Promise<{
    id: string;
    width: number;
    height: number;
    filename: string;
  }>;
  onDropComplete?: () => void;
}

/**
 * Plugin that handles image paste and drop
 */
export function createImageUploadPlugin(options: ImageUploadOptions) {
  const { onImageDrop, onDropComplete } = options;
  
  return new Plugin({
    key: imageUploadPluginKey,
    
    props: {
      handlePaste(view, event) {
        if (!onImageDrop) return false;
        
        const items = Array.from(event.clipboardData?.items || []);
        const imageItem = items.find((item) => item.type.startsWith('image/'));
        
        if (!imageItem) return false;
        
        const file = imageItem.getAsFile();
        if (!file) return false;
        
        event.preventDefault();
        
        // Insert placeholder image
        const { state, dispatch } = view;
        const placeholder = schema.nodes.image.create({
          imageId: 'uploading',
          alt: 'Uploading...'
        });
        
        const tr = state.tr.replaceSelectionWith(placeholder);
        dispatch(tr);
        
        // Get position of inserted placeholder
        const pos = tr.selection.from - 1;
        
        // Upload the image
        onImageDrop(file)
          .then(({ id, width, height, filename }) => {
            // Replace placeholder with actual image
            const currentState = view.state;
            const node = currentState.doc.nodeAt(pos);
            
            if (node && node.type === schema.nodes.image) {
              const newImage = schema.nodes.image.create({
                imageId: id,
                alt: filename,
                width: String(width),
                height: String(height)
              });
              
              const updateTr = currentState.tr.replaceWith(pos, pos + 1, newImage);
              view.dispatch(updateTr);
            }
          })
          .catch((error) => {
            console.error('Failed to upload pasted image:', error);
            // Remove placeholder on error
            const currentState = view.state;
            const node = currentState.doc.nodeAt(pos);
            if (node && node.type === schema.nodes.image) {
              const deleteTr = currentState.tr.delete(pos, pos + 1);
              view.dispatch(deleteTr);
            }
          })
          .finally(() => {
            onDropComplete?.();
          });
        
        return true;
      },
      
      handleDrop(view, event) {
        if (!onImageDrop) return false;
        
        const files = Array.from(event.dataTransfer?.files || []);
        const imageFile = files.find((file) => file.type.startsWith('image/'));
        
        if (!imageFile) return false;
        
        event.preventDefault();
        
        // Get drop position
        const pos = view.posAtCoords({ left: event.clientX, top: event.clientY });
        if (!pos) return true;
        
        // Insert placeholder image at drop position
        const { state, dispatch } = view;
        const placeholder = schema.nodes.image.create({
          imageId: 'uploading',
          alt: 'Uploading...'
        });
        
        const tr = state.tr.insert(pos.pos, placeholder);
        dispatch(tr);
        
        // Upload the image
        onImageDrop(imageFile)
          .then(({ id, width, height, filename }) => {
            // Replace placeholder with actual image
            const currentState = view.state;
            const node = currentState.doc.nodeAt(pos.pos);
            
            if (node && node.type === schema.nodes.image) {
              const newImage = schema.nodes.image.create({
                imageId: id,
                alt: filename,
                width: String(width),
                height: String(height)
              });
              
              const updateTr = currentState.tr.replaceWith(pos.pos, pos.pos + 1, newImage);
              view.dispatch(updateTr);
            }
          })
          .catch((error) => {
            console.error('Failed to upload dropped image:', error);
            // Remove placeholder on error
            const currentState = view.state;
            const node = currentState.doc.nodeAt(pos.pos);
            if (node && node.type === schema.nodes.image) {
              const deleteTr = currentState.tr.delete(pos.pos, pos.pos + 1);
              view.dispatch(deleteTr);
            }
          })
          .finally(() => {
            onDropComplete?.();
          });
        
        return true;
      },
      
      handleDOMEvents: {
        dragover(_view, event) {
          if (!onImageDrop) return false;
          if (event.dataTransfer?.types?.includes('Files')) {
            event.preventDefault();
            return true;
          }
          return false;
        }
      }
    }
  });
}
