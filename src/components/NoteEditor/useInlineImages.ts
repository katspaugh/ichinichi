import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { RefObject } from "react";
import type { ImageRepository } from "../../storage/imageRepository";
import { compressImage } from "../../utils/imageCompression";

interface UseInlineImageUploadOptions {
  date: string;
  isEditable: boolean;
  imageRepository: ImageRepository | null;
}

interface UseInlineImageUrlsOptions {
  date: string;
  content: string;
  editorRef: RefObject<HTMLDivElement | null>;
  imageRepository: ImageRepository | null;
}

export function useInlineImageUpload({
  date,
  isEditable,
  imageRepository,
}: UseInlineImageUploadOptions) {
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

      const meta = await imageRepository.uploadImage(
        date,
        new File([compressed.blob], file.name, { type: compressed.blob.type }),
        "inline",
        { width: compressed.width, height: compressed.height },
      );

      return {
        id: meta.id,
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
  imageRepository,
}: UseInlineImageUrlsOptions) {
  const metaCacheRef = useRef<Map<string, { width: number; height: number }>>(
    new Map(),
  );
  const dateRef = useRef<string | null>(null);
  const repoRef = useRef<typeof imageRepository>(null);
  const urlCacheRef = useRef<Map<string, string>>(new Map());
  const ownerId = useId();
  const ownerIdRef = useRef(`note-editor-${ownerId}`);
  const currentIdsRef = useRef<Set<string>>(new Set());
  const [metaVersion, setMetaVersion] = useState(0);

  // Load image meta for current date
  useEffect(() => {
    if (!imageRepository) return;
    if (dateRef.current === date && repoRef.current === imageRepository) return;

    dateRef.current = date;
    repoRef.current = imageRepository;
    metaCacheRef.current = new Map();
    currentIdsRef.current = new Set();

    const loadMeta = async () => {
      const metas = await imageRepository.getImagesByDate(date);
      const map = new Map<string, { width: number; height: number }>();
      metas.forEach((meta) => {
        if (meta.width > 0 && meta.height > 0) {
          map.set(meta.id, { width: meta.width, height: meta.height });
        }
      });
      metaCacheRef.current = map;
      setMetaVersion((value) => value + 1);
    };

    void loadMeta();
  }, [date, imageRepository]);

  // Revoke object URLs on unmount
  useEffect(() => {
    const urls = urlCacheRef.current;
    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url));
      urls.clear();
      currentIdsRef.current = new Set();
    };
  }, [imageRepository]);

  // Resolve image URLs in editor
  useEffect(() => {
    const contentEl = editorRef.current;
    if (!contentEl || !imageRepository) return;

    const images = contentEl.querySelectorAll("img[data-image-id]");
    if (!images.length) {
      currentIdsRef.current = new Set();
      return;
    }

    const nextIds = new Set<string>();

    images.forEach((img) => {
      const imageId = img.getAttribute("data-image-id");
      if (!imageId || imageId === "uploading") return;

      nextIds.add(imageId);

      if (!img.getAttribute("width") || !img.getAttribute("height")) {
        const meta = metaCacheRef.current.get(imageId);
        if (meta) {
          img.setAttribute("width", String(meta.width));
          img.setAttribute("height", String(meta.height));
        }
      }

      // Already resolved
      const cached = urlCacheRef.current.get(imageId);
      if (cached && img.getAttribute("src") === cached) return;

      img.setAttribute("data-image-loading", "true");

      const mimeType =
        metaCacheRef.current.get(imageId) ? "image/jpeg" : "image/jpeg";

      imageRepository
        .getImage(imageId, mimeType)
        .then((blob) => {
          if (!blob) return;

          const url = URL.createObjectURL(blob);
          // Revoke old URL if exists
          const old = urlCacheRef.current.get(imageId);
          if (old) URL.revokeObjectURL(old);
          urlCacheRef.current.set(imageId, url);

          const currentImg = editorRef.current?.querySelector(
            `img[data-image-id="${imageId}"]`,
          );
          if (currentImg && currentImg.getAttribute("src") !== url) {
            const scrollTop = editorRef.current?.scrollTop ?? 0;
            currentImg.setAttribute("src", url);
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

    // Release URLs for images no longer in DOM
    currentIdsRef.current.forEach((imageId) => {
      if (!nextIds.has(imageId)) {
        const url = urlCacheRef.current.get(imageId);
        if (url) {
          URL.revokeObjectURL(url);
          urlCacheRef.current.delete(imageId);
        }
      }
    });
    currentIdsRef.current = nextIds;
    void ownerIdRef.current; // suppress unused
  }, [content, editorRef, imageRepository, metaVersion]);
}
