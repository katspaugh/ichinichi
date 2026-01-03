import { Node as ProseMirrorNode } from 'prosemirror-model';
import type { NodeView } from 'prosemirror-view';
import { EditorView } from 'prosemirror-view';
import { ImageUrlManager } from '../../utils/imageUrlManager';

/**
 * NodeView for images that handles async URL resolution
 * The image URL is not stored in the document - only data-image-id
 * URLs are resolved on-demand from the image repository
 */
export class ImageNodeView implements NodeView {
  dom: HTMLImageElement;
  private imageId: string;
  private urlManager: ImageUrlManager;
  private ownerId: string;
  
  constructor(
    node: ProseMirrorNode,
    _view: EditorView,
    _getPos: () => number | undefined,
    urlManager: ImageUrlManager,
    ownerId: string
  ) {
    this.imageId = node.attrs.imageId;
    this.urlManager = urlManager;
    this.ownerId = ownerId;
    
    // Create the DOM element
    this.dom = document.createElement('img');
    this.dom.setAttribute('data-image-id', this.imageId);
    this.dom.alt = node.attrs.alt || '';
    
    if (node.attrs.width) {
      this.dom.setAttribute('width', node.attrs.width);
    }
    if (node.attrs.height) {
      this.dom.setAttribute('height', node.attrs.height);
    }
    
    // Start loading indicator
    this.dom.setAttribute('data-image-loading', 'true');
    
    // Resolve URL asynchronously
    if (this.imageId !== 'uploading') {
      this.resolveUrl();
    }
  }
  
  private async resolveUrl() {
    try {
      const url = await this.urlManager.acquireUrl(this.imageId, this.ownerId);
      if (url && this.dom) {
        this.dom.src = url;
      }
    } catch (error) {
      console.error(`Failed to resolve image ${this.imageId}:`, error);
      if (this.dom) {
        this.dom.alt = 'Failed to load image';
      }
    } finally {
      if (this.dom) {
        this.dom.removeAttribute('data-image-loading');
      }
    }
  }
  
  update(node: ProseMirrorNode): boolean {
    // If it's a different image, recreate the view
    if (node.attrs.imageId !== this.imageId) {
      return false;
    }
    
    // Update attributes
    this.dom.alt = node.attrs.alt || '';
    
    if (node.attrs.width) {
      this.dom.setAttribute('width', node.attrs.width);
    } else {
      this.dom.removeAttribute('width');
    }
    
    if (node.attrs.height) {
      this.dom.setAttribute('height', node.attrs.height);
    } else {
      this.dom.removeAttribute('height');
    }
    
    return true;
  }
  
  destroy() {
    // Release the URL when the view is destroyed
    if (this.imageId !== 'uploading') {
      this.urlManager.releaseImage(this.imageId, this.ownerId);
    }
  }
  
  stopEvent(): boolean {
    return true; // Prevent ProseMirror from handling clicks on images
  }
  
  ignoreMutation(): boolean {
    return true; // Ignore mutations to the img element (src changes, etc.)
  }
}
