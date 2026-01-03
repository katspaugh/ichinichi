import { inputRules, InputRule } from 'prosemirror-inputrules';
import { schema } from '../schema';
import { NodeType } from 'prosemirror-model';
import { TextSelection } from 'prosemirror-state';

/**
 * Creates an input rule that converts "---" to a horizontal rule
 */
function horizontalRuleInputRule(nodeType: NodeType): InputRule {
  return new InputRule(
    /^---$/,
    (state, _match, start, end) => {
      const tr = state.tr;
      
      // Delete the "---" text
      tr.delete(start, end);
      
      // Insert horizontal rule
      tr.insert(start, nodeType.create());
      
      // Insert a new paragraph after the HR for continued editing
      tr.insert(start + 1, schema.nodes.paragraph.create());
      
      // Set selection to the new paragraph
      tr.setSelection(TextSelection.near(tr.doc.resolve(start + 2)));
      
      return tr;
    }
  );
}

/**
 * Plugin that converts "---" at the start of a line to a horizontal rule
 */
export function createHorizontalRulePlugin() {
  return inputRules({
    rules: [horizontalRuleInputRule(schema.nodes.horizontal_rule)]
  });
}
