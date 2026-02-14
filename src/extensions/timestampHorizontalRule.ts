import { Node, mergeAttributes, nodeInputRule } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
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
    return [
      // Match --- or —- (mobile emdash) at start of line
      nodeInputRule({
        find: /^\s*(---|—-)\s*$/,
        type: this.type,
        getAttributes: () => makeTimestampAttrs(),
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

          // Insert timestamp HR at beginning of document
          const { timestamp, label } = makeTimestampAttrs();
          const tr = newState.tr;
          tr.insert(
            0,
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
