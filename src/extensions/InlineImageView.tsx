import { useEffect, useId, useRef, useState } from "react";
import { NodeViewWrapper } from "@tiptap/react";
import type { NodeViewProps } from "@tiptap/react";
import { useNoteRepositoryContext } from "../contexts/noteRepositoryContext";
import { ImageUrlManager } from "../utils/imageUrlManager";

export function InlineImageView({ node }: NodeViewProps) {
  const { dataImageId, alt, width, height, src: attrSrc } = node.attrs;
  const { imageRepository } = useNoteRepositoryContext();
  const [resolvedSrc, setResolvedSrc] = useState<string | null>(attrSrc || null);
  const [isLoading, setIsLoading] = useState(false);
  const managerRef = useRef<ImageUrlManager | null>(null);
  const ownerId = useId();
  const ownerIdRef = useRef(`inline-image-${ownerId}`);

  // Create/cleanup ImageUrlManager
  useEffect(() => {
    if (!imageRepository) return;
    const manager = new ImageUrlManager(imageRepository);
    managerRef.current = manager;
    return () => {
      manager.releaseOwner(ownerIdRef.current);
      managerRef.current = null;
    };
  }, [imageRepository]);

  // Resolve image URL when dataImageId changes
  useEffect(() => {
    if (!dataImageId || dataImageId === "uploading") {
      return;
    }
    if (!managerRef.current) return;

    let cancelled = false;
    setIsLoading(true);

    managerRef.current
      .acquireUrl(dataImageId, ownerIdRef.current)
      .then((url) => {
        if (!cancelled && url) {
          setResolvedSrc(url);
        }
      })
      .catch((error) => {
        console.error(`Failed to resolve image ${dataImageId}:`, error);
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [dataImageId]);

  // Use attrSrc (e.g. blob preview during upload) if no resolved src
  const displaySrc = resolvedSrc || attrSrc || undefined;

  return (
    <NodeViewWrapper as="span">
      <img
        src={displaySrc}
        alt={alt || ""}
        width={width || undefined}
        height={height || undefined}
        data-image-id={dataImageId || undefined}
        data-image-loading={isLoading ? "true" : undefined}
        draggable={false}
      />
    </NodeViewWrapper>
  );
}
