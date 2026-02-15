import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { RefObject } from "react";
import { useNoteRepositoryContext } from "../../contexts/noteRepositoryContext";
import { compressImage } from "../../utils/imageCompression";
import { ImageUrlManager } from "../../utils/imageUrlManager";

interface UseInlineImageUploadOptions {
  date: string;
  isEditable: boolean;
}

interface UseInlineImageUrlsOptions {
  date: string;
  content: string;
  editorRef: RefObject<HTMLDivElement | null>;
}

export function useInlineImageUpload({
  date,
  isEditable,
}: UseInlineImageUploadOptions) {
  const { imageRepository } = useNoteRepositoryContext();

  const uploadInlineImage = useCallback(
    async (
      file: File,
    ): Promise<{
      id: string;
      width: number;
      height: number;
      filename: string;
    }> => {
      if (!imageRepository) {
        throw new Error("Image repository not available");
      }

      const compressed = await compressImage(file);

      const result = await imageRepository.upload(
        date,
        compressed.blob,
        "inline",
        file.name,
        { width: compressed.width, height: compressed.height },
      );

      if (!result.ok) {
        throw new Error(result.error.message);
      }

      return {
        id: result.value.id,
        width: compressed.width,
        height: compressed.height,
        filename: file.name,
      };
    },
    [imageRepository, date],
  );

  return {
    onImageDrop: isEditable && imageRepository ? uploadInlineImage : undefined,
  };
}

export function useInlineImageUrls({
  date,
  content,
  editorRef,
}: UseInlineImageUrlsOptions) {
  const { imageRepository } = useNoteRepositoryContext();
  const metaCacheRef = useRef<Map<string, { width: number; height: number }>>(
    new Map(),
  );
  const dateRef = useRef<string | null>(null);
  const repoRef = useRef<typeof imageRepository>(null);
  const managerRef = useRef<ImageUrlManager | null>(null);
  const ownerId = useId();
  const ownerIdRef = useRef(`note-editor-${ownerId}`);
  const currentIdsRef = useRef<Set<string>>(new Set());
  const [metaVersion, setMetaVersion] = useState(0);

  useEffect(() => {
    if (!imageRepository) return;
    if (dateRef.current === date && repoRef.current === imageRepository) return;

    dateRef.current = date;
    repoRef.current = imageRepository;
    metaCacheRef.current = new Map();
    currentIdsRef.current = new Set();

    const loadMeta = async () => {
      const result = await imageRepository.getByNoteDate(date);
      if (result.ok) {
        const map = new Map<string, { width: number; height: number }>();
        result.value.forEach((meta) => {
          if (meta.width > 0 && meta.height > 0) {
            map.set(meta.id, { width: meta.width, height: meta.height });
          }
        });
        metaCacheRef.current = map;
      } else {
        metaCacheRef.current = new Map();
      }
      setMetaVersion((value) => value + 1);
    };

    void loadMeta();
  }, [date, imageRepository]);

  useEffect(() => {
    if (!imageRepository) return;
    const manager = new ImageUrlManager(imageRepository);
    const ownerId = ownerIdRef.current;
    managerRef.current = manager;
    return () => {
      manager.releaseOwner(ownerId);
      managerRef.current = null;
      currentIdsRef.current = new Set();
    };
  }, [imageRepository]);

  useEffect(() => {
    const contentEl = editorRef.current;
    const manager = managerRef.current;
    if (!contentEl || !manager) {
      return;
    }

    const images = contentEl.querySelectorAll("img[data-image-id]");
    if (!images.length) {
      currentIdsRef.current.forEach((imageId) => {
        manager.releaseImage(imageId, ownerIdRef.current);
      });
      currentIdsRef.current = new Set();
      return;
    }

    const nextIds = new Set<string>();

    images.forEach((img) => {
      const imageId = img.getAttribute("data-image-id");
      if (!imageId || imageId === "uploading") {
        return;
      }

      nextIds.add(imageId);

      if (!img.getAttribute("width") || !img.getAttribute("height")) {
        const meta = metaCacheRef.current.get(imageId);
        if (meta) {
          img.setAttribute("width", String(meta.width));
          img.setAttribute("height", String(meta.height));
        }
      }

      img.setAttribute("data-image-loading", "true");

      manager
        .acquireUrl(imageId, ownerIdRef.current)
        .then((url) => {
          if (!url) {
            return;
          }

          const currentImg = editorRef.current?.querySelector(
            `img[data-image-id="${imageId}"]`,
          );
          if (currentImg && currentImg.getAttribute("src") !== url) {
            // Save scroll position before setting src to prevent iOS Safari scroll jump
            const scrollTop = editorRef.current?.scrollTop ?? 0;
            currentImg.setAttribute("src", url);
            // Restore scroll position immediately
            if (editorRef.current) {
              editorRef.current.scrollTop = scrollTop;
            }
          }
        })
        .catch((error) => {
          console.error(`Failed to resolve image ${imageId}:`, error);
          const currentImg = editorRef.current?.querySelector(
            `img[data-image-id="${imageId}"]`,
          );
          if (currentImg) {
            currentImg.setAttribute("alt", "Failed to load image");
          }
        })
        .finally(() => {
          const currentImg = editorRef.current?.querySelector(
            `img[data-image-id="${imageId}"]`,
          );
          if (currentImg) {
            currentImg.removeAttribute("data-image-loading");
          }
        });
    });

    currentIdsRef.current.forEach((imageId) => {
      if (!nextIds.has(imageId)) {
        manager.releaseImage(imageId, ownerIdRef.current);
      }
    });
    currentIdsRef.current = nextIds;
  }, [content, editorRef, imageRepository, metaVersion]);
}
