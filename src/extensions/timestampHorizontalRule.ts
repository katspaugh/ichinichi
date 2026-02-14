import { Node, mergeAttributes, InputRule } from "@tiptap/core";
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import { getTimestampLabel } from "../services/timestampLabel";

const ADDITION_WINDOW_MS = 10 * 60 * 1000;

export interface TimestampHorizontalRuleOptions {
  HTMLAttributes: Record<string, unknown>;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    timestampHorizontalRule: {
      setTimestampHorizontalRule: () => ReturnType;
    };
  }
}

function makeTimestampAttrs() {
  const timestamp = new Date().toISOString();
  const label = getTimestampLabel(timestamp);
  return { timestamp, label };
}

export const timestampSessionPluginKey = new PluginKey("timestampSession");

export const TimestampHorizontalRule = Node.create<TimestampHorizontalRuleOptions>({
  name: "timestampHorizontalRule",

  group: "block",

  defining: true,

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  addAttributes() {
    return {
      timestamp: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-timestamp"),
        renderHTML: (attributes) => {
          if (!attributes.timestamp) return {};
          return { "data-timestamp": attributes.timestamp };
        },
      },
      label: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-label"),
        renderHTML: (attributes) => {
          if (!attributes.label) return {};
          return { "data-label": attributes.label };
        },
      },
      weather: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-weather"),
        renderHTML: (attributes) => {
          if (!attributes.weather) return {};
          return { "data-weather": attributes.weather };
        },
      },
    };
  },

  parseHTML() {
    return [{ tag: "hr" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "hr",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        contenteditable: "false",
      }),
    ];
  },

  addCommands() {
    return {
      setTimestampHorizontalRule:
        () =>
        ({ chain }) => {
          const { timestamp, label } = makeTimestampAttrs();
          return chain()
            .insertContent([
              {
                type: this.name,
                attrs: { timestamp, label },
              },
              { type: "paragraph" },
            ])
            .run();
        },
    };
  },

  addInputRules() {
    const hrType = this.type;
    const schema = this.editor.schema;

    return [
      // Match --- or —- (mobile emdash) at start of line.
      // Custom rule to replace the paragraph with HR + new paragraph,
      // then place the cursor in the new paragraph.
      new InputRule({
        find: /^\s*(---|—-)\s*$/,
        handler: ({ state, range, match }) => {
          const { tr } = state;
          const $from = state.doc.resolve(range.from);

          // Resolve the block that contains the match (the paragraph with ---)
          const blockStart = $from.start($from.depth);
          const blockEnd = $from.end($from.depth);

          // Check that we're replacing an entire block
          if (match[0].trim().length < 2) return;

          const { timestamp, label } = makeTimestampAttrs();
          const hrNode = hrType.create({ timestamp, label });
          const newParagraph = schema.nodes.paragraph.create();

          // Replace the entire paragraph block (including its boundaries)
          // with the HR node + a new empty paragraph
          tr.replaceWith(blockStart - 1, blockEnd + 1, [hrNode, newParagraph]);

          // Place cursor inside the new paragraph (after the HR)
          const cursorPos = blockStart - 1 + hrNode.nodeSize + 1;
          tr.setSelection(TextSelection.create(tr.doc, cursorPos));
        },
      }),
    ];
  },

  addProseMirrorPlugins() {
    const extensionType = this.type;

    return [
      new Plugin({
        key: timestampSessionPluginKey,
        state: {
          init() {
            return {
              lastEditTimestamp: null as number | null,
              hasInsertedTimestamp: false,
              lastBlockPos: null as number | null,
            };
          },
          apply(tr, value) {
            // Only track when doc changes from user input
            if (!tr.docChanged || tr.getMeta("remote") || tr.getMeta("timestampInsert")) {
              return value;
            }
            return {
              ...value,
              lastEditTimestamp: Date.now(),
            };
          },
        },

        appendTransaction(transactions, oldState, newState) {
          // Only process user edits (doc changes)
          const hasDocChange = transactions.some(
            (tr) => tr.docChanged && !tr.getMeta("remote") && !tr.getMeta("timestampInsert"),
          );
          if (!hasDocChange) return null;

          const pluginState = timestampSessionPluginKey.getState(oldState);
          if (!pluginState) return null;

          const now = Date.now();
          const { lastEditTimestamp, hasInsertedTimestamp } = pluginState;

          // Check if >10 min since last edit
          if (hasInsertedTimestamp) return null;
          if (lastEditTimestamp !== null && now - lastEditTimestamp <= ADDITION_WINDOW_MS) {
            return null;
          }

          // Also check timestamps in the document
          let latestDocTimestamp: number | null = null;
          newState.doc.descendants((node) => {
            if (node.type === extensionType && node.attrs.timestamp) {
              const ts = Date.parse(node.attrs.timestamp);
              if (!Number.isNaN(ts)) {
                latestDocTimestamp =
                  latestDocTimestamp === null ? ts : Math.max(latestDocTimestamp, ts);
              }
            }
          });

          if (latestDocTimestamp !== null && now - latestDocTimestamp <= ADDITION_WINDOW_MS) {
            return null;
          }

          // Insert timestamp HR before the block where the user is typing.
          // This places it after existing content but before new input.
          // On an empty note this is position 0 (the top).
          const { timestamp, label } = makeTimestampAttrs();
          const tr = newState.tr;
          const { $from } = newState.selection;
          const insertPos = $from.before($from.depth === 0 ? 1 : $from.depth);
          tr.insert(
            insertPos,
            extensionType.create({ timestamp, label }),
          );
          tr.setMeta("timestampInsert", true);

          // Mark that we've inserted a timestamp for this session
          // We update the plugin state by setting meta
          tr.setMeta(timestampSessionPluginKey, {
            lastEditTimestamp: now,
            hasInsertedTimestamp: true,
            lastBlockPos: null,
          });

          return tr;
        },
      }),
    ];
  },
});
