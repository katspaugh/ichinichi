import { keymap } from 'prosemirror-keymap';
import { baseKeymap } from 'prosemirror-commands';
import { toggleBold, toggleItalic, toggleStrike } from '../commands';

/**
 * Default keymap for the editor
 * Includes base ProseMirror keybindings plus custom shortcuts
 */
export function createKeymap() {
  return keymap({
    ...baseKeymap,
    // Bold: Cmd+B (Mac) or Ctrl+B (Windows/Linux)
    'Mod-b': toggleBold,
    // Italic: Cmd+I (Mac) or Ctrl+I (Windows/Linux)
    'Mod-i': toggleItalic,
    // Strikethrough: Cmd+Shift+X (Mac) or Ctrl+Shift+X (Windows/Linux)
    'Mod-Shift-x': toggleStrike
  });
}
