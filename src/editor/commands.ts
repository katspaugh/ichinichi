import type { Command } from 'prosemirror-state';
import { toggleMark } from 'prosemirror-commands';
import { schema } from './schema';

/**
 * Toggle bold mark
 */
export const toggleBold: Command = toggleMark(schema.marks.bold);

/**
 * Toggle italic mark
 */
export const toggleItalic: Command = toggleMark(schema.marks.italic);

/**
 * Toggle underline mark
 */
export const toggleUnderline: Command = toggleMark(schema.marks.underline);

/**
 * Toggle strikethrough mark
 */
export const toggleStrike: Command = toggleMark(schema.marks.strike);

/**
 * Insert a horizontal rule
 */
export const insertHorizontalRule: Command = (state, dispatch) => {
  if (!dispatch) return true;
  
  const hr = schema.nodes.horizontal_rule.create();
  
  const tr = state.tr.replaceSelectionWith(hr);
  dispatch(tr);
  return true;
};

/**
 * Insert a hard break (line break)
 */
export const insertHardBreak: Command = (state, dispatch) => {
  if (!dispatch) return true;
  
  const br = schema.nodes.hard_break.create();
  const tr = state.tr.replaceSelectionWith(br);
  dispatch(tr);
  return true;
};
