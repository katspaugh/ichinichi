import Image from "@tiptap/extension-image";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { InlineImageView } from "./InlineImageView";

export type ImageUploadFn = (
  file: File,
) => Promise<{ id: string; width: number; height: number; filename: string }>;

export interface InlineImageOptions {
  onImageDrop?: ImageUploadFn;
  onDropComplete?: () => void;
}

const inlineImagePluginKey = new PluginKey("inlineImageUpload");

export const InlineImage = Image.extend<InlineImageOptions>({
  name: "image",

  addOptions() {
    return {
      ...this.parent?.(),
      onImageDrop: undefined,
      onDropComplete: undefined,
      inline: false,
      allowBase64: true,
    };
  },

  addAttributes() {
    return {
      ...this.parent?.(),
      dataImageId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-image-id"),
        renderHTML: (attributes) => {
          if (!attributes.dataImageId) return {};
          return { "data-image-id": attributes.dataImageId };
        },
      },
      dataImageLoading: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-image-loading"),
        renderHTML: (attributes) => {
          if (!attributes.dataImageLoading) return {};
          return { "data-image-loading": attributes.dataImageLoading };
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: "img",
        getAttrs: (element) => {
          const el = element as HTMLElement;
          return {
            src: el.getAttribute("src"),
            alt: el.getAttribute("alt"),
            width: el.getAttribute("width"),
            height: el.getAttribute("height"),
            dataImageId: el.getAttribute("data-image-id"),
            dataImageLoading: el.getAttribute("data-image-loading"),
          };
        },
      },
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(InlineImageView);
  },

  addProseMirrorPlugins() {
    const extensionThis = this;

    return [
      new Plugin({
        key: inlineImagePluginKey,
        props: {
          handlePaste(view, event) {
            const onImageDrop = extensionThis.options.onImageDrop;
            if (!onImageDrop) return false;

            const items = Array.from(event.clipboardData?.items ?? []);
            const imageItem = items.find((item) => item.type.startsWith("image/"));
            if (!imageItem) return false;

            const file = imageItem.getAsFile();
            if (!file) return false;

            event.preventDefault();

            const { state, dispatch } = view;
            const { tr, schema } = state;
            const imageType = schema.nodes.image;

            // Insert placeholder
            const placeholderNode = imageType.create({
              dataImageId: "uploading",
              alt: "Uploading...",
            });
            dispatch(tr.replaceSelectionWith(placeholderNode));

            onImageDrop(file)
              .then(({ id, width, height, filename }) => {
                // Find the placeholder and replace it
                const { state: currentState } = view;
                const { tr: newTr } = currentState;
                let found = false;
                currentState.doc.descendants((node, pos) => {
                  if (
                    found ||
                    node.type !== imageType ||
                    node.attrs.dataImageId !== "uploading"
                  )
                    return;
                  found = true;
                  newTr.setNodeMarkup(pos, undefined, {
                    ...node.attrs,
                    dataImageId: id,
                    alt: filename,
                    width,
                    height,
                  });
                });
                if (found) {
                  view.dispatch(newTr);
                }
              })
              .catch((error) => {
                console.error("Failed to upload pasted image:", error);
                // Remove placeholder
                const { state: currentState } = view;
                const { tr: newTr } = currentState;
                let found = false;
                currentState.doc.descendants((node, pos) => {
                  if (
                    found ||
                    node.type !== imageType ||
                    node.attrs.dataImageId !== "uploading"
                  )
                    return;
                  found = true;
                  newTr.delete(pos, pos + node.nodeSize);
                });
                if (found) {
                  view.dispatch(newTr);
                }
              })
              .finally(() => {
                extensionThis.options.onDropComplete?.();
              });

            return true;
          },

          handleDrop(view, event, _slice, moved) {
            if (moved) return false;

            const onImageDrop = extensionThis.options.onImageDrop;
            if (!onImageDrop) return false;

            const files = event.dataTransfer?.files;
            if (!files || files.length === 0) return false;

            const file = files[0];
            if (!file.type.startsWith("image/")) return false;

            event.preventDefault();

            const { state, dispatch } = view;
            const { schema } = state;
            const imageType = schema.nodes.image;

            // Get drop position
            const dropPos = view.posAtCoords({
              left: event.clientX,
              top: event.clientY,
            });
            const pos = dropPos ? dropPos.pos : state.selection.from;

            // Insert placeholder with preview
            const previewUrl = URL.createObjectURL(file);
            const placeholderNode = imageType.create({
              dataImageId: "uploading",
              alt: "Uploading...",
              src: previewUrl,
            });
            const tr = state.tr.insert(pos, placeholderNode);
            dispatch(tr);

            onImageDrop(file)
              .then(({ id, width, height, filename }) => {
                const { state: currentState } = view;
                const { tr: newTr } = currentState;
                let found = false;
                currentState.doc.descendants((node, nodePos) => {
                  if (
                    found ||
                    node.type !== imageType ||
                    node.attrs.dataImageId !== "uploading"
                  )
                    return;
                  found = true;
                  newTr.setNodeMarkup(nodePos, undefined, {
                    ...node.attrs,
                    dataImageId: id,
                    alt: filename,
                    width,
                    height,
                    src: null, // Will be resolved by NodeView
                  });
                });
                if (found) {
                  view.dispatch(newTr);
                }
              })
              .catch((error) => {
                console.error("Failed to upload dropped image:", error);
                const { state: currentState } = view;
                const { tr: newTr } = currentState;
                let found = false;
                currentState.doc.descendants((node, nodePos) => {
                  if (
                    found ||
                    node.type !== imageType ||
                    node.attrs.dataImageId !== "uploading"
                  )
                    return;
                  found = true;
                  newTr.delete(nodePos, nodePos + node.nodeSize);
                });
                if (found) {
                  view.dispatch(newTr);
                }
              })
              .finally(() => {
                URL.revokeObjectURL(previewUrl);
                extensionThis.options.onDropComplete?.();
              });

            return true;
          },
        },
      }),
    ];
  },
});
