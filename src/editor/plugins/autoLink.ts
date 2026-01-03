import { Plugin, PluginKey } from 'prosemirror-state';
import { schema } from '../schema';
import { findUrls, normalizeUrl } from '../../utils/linkify';

export const autoLinkPluginKey = new PluginKey('autoLink');

/**
 * Plugin that automatically converts URLs to links when user types space or enter
 */
export function createAutoLinkPlugin() {
  return new Plugin({
    key: autoLinkPluginKey,
    
    props: {
      handleTextInput(view, from, to, text) {
        // Only linkify on space or newline
        if (text !== ' ' && text !== '\n') {
          return false;
        }
        
        const { state, dispatch } = view;
        const $from = state.doc.resolve(from);
        
        // Get text content before cursor
        const textBefore = $from.parent.textContent.slice(0, $from.parentOffset);
        const urls = findUrls(textBefore);
        
        if (urls.length === 0) {
          return false;
        }
        
        // Get the last URL found
        const lastUrl = urls[urls.length - 1];
        
        // Calculate absolute position of the URL in the document
        const urlStart = from - $from.parentOffset + lastUrl.start;
        const urlEnd = from - $from.parentOffset + lastUrl.end;
        
        // Check if this range already has a link mark
        const existingMarks = state.doc.rangeHasMark(urlStart, urlEnd, schema.marks.link);
        if (existingMarks) {
          return false;
        }
        
        // Create link mark and apply it
        const linkMark = schema.marks.link.create({
          href: normalizeUrl(lastUrl.url)
        });
        
        let tr = state.tr;
        tr = tr.addMark(urlStart, urlEnd, linkMark);
        
        // Insert the space/newline that triggered this
        tr = tr.insertText(text, to);
        
        dispatch(tr);
        return true;
      }
    }
  });
}
