import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { useNoteRepositoryContext } from '../../contexts/noteRepositoryContext';
import { compressImage } from '../../utils/imageCompression';
import { revokeImageUrls } from '../../utils/imageResolver';

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
  isEditable
}: UseInlineImageUploadOptions) {
  const { imageRepository } = useNoteRepositoryContext();

  const uploadInlineImage = useCallback(async (file: File): Promise<{
    id: string;
    width: number;
    height: number;
    filename: string;
  }> => {
    if (!imageRepository) {
      throw new Error('Image repository not available');
    }

    const compressed = await compressImage(file);

    const meta = await imageRepository.upload(
      date,
      compressed.blob,
      'inline',
      file.name,
      { width: compressed.width, height: compressed.height }
    );

    return {
      id: meta.id,
      width: compressed.width,
      height: compressed.height,
      filename: file.name
    };
  }, [imageRepository, date]);

  return {
    onImageDrop: isEditable && imageRepository ? uploadInlineImage : undefined
  };
}

export function useInlineImageUrls({
  date,
  content,
  editorRef
}: UseInlineImageUrlsOptions) {
  const { imageRepository } = useNoteRepositoryContext();
  const resolvedIdsRef = useRef<Set<string>>(new Set());
  const inFlightIdsRef = useRef<Set<string>>(new Set());
  const urlCacheRef = useRef<Map<string, string>>(new Map());
  const metaCacheRef = useRef<Map<string, { width: number; height: number }>>(new Map());
  const dateRef = useRef<string | null>(null);
  const repoRef = useRef<typeof imageRepository>(null);
  const [metaVersion, setMetaVersion] = useState(0);

  useEffect(() => {
    if (!imageRepository) return;
    if (dateRef.current === date && repoRef.current === imageRepository) return;

    dateRef.current = date;
    repoRef.current = imageRepository;
    resolvedIdsRef.current = new Set();
    inFlightIdsRef.current = new Set();
    urlCacheRef.current = new Map();
    metaCacheRef.current = new Map();

    const loadMeta = async () => {
      try {
        const metas = await imageRepository.getByNoteDate(date);
        const map = new Map<string, { width: number; height: number }>();
        metas.forEach((meta) => {
          if (meta.width > 0 && meta.height > 0) {
            map.set(meta.id, { width: meta.width, height: meta.height });
          }
        });
        metaCacheRef.current = map;
      } catch {
        metaCacheRef.current = new Map();
      } finally {
        setMetaVersion((value) => value + 1);
      }
    };

    void loadMeta();
  }, [date, imageRepository]);

  useEffect(() => {
    const contentEl = editorRef.current;
    return () => {
      if (contentEl) {
        revokeImageUrls(contentEl);
      }
    };
  }, [date, editorRef, imageRepository]);

  useEffect(() => {
    if (!editorRef.current || !imageRepository) {
      return;
    }

    const images = editorRef.current.querySelectorAll('img[data-image-id]');
    if (!images.length) {
      return;
    }

    images.forEach((img) => {
      const imageId = img.getAttribute('data-image-id');
      if (!imageId || imageId === 'uploading') {
        return;
      }

      if (!img.getAttribute('width') || !img.getAttribute('height')) {
        const meta = metaCacheRef.current.get(imageId);
        if (meta) {
          img.setAttribute('width', String(meta.width));
          img.setAttribute('height', String(meta.height));
        }
      }

      if (resolvedIdsRef.current.has(imageId)) {
        const cachedUrl = urlCacheRef.current.get(imageId);
        if (cachedUrl && img.getAttribute('src') !== cachedUrl) {
          img.setAttribute('src', cachedUrl);
        }
        return;
      }
      if (inFlightIdsRef.current.has(imageId)) {
        return;
      }

      img.setAttribute('data-image-loading', 'true');
      inFlightIdsRef.current.add(imageId);

      imageRepository.getUrl(imageId)
        .then((url) => {
          if (!url) {
            return;
          }
          urlCacheRef.current.set(imageId, url);
          resolvedIdsRef.current.add(imageId);

          // Query for the image again to ensure we're updating the current DOM node
          // (ProseMirror may have re-rendered since we captured the element)
          const currentImg = editorRef.current?.querySelector(`img[data-image-id="${imageId}"]`);
          if (currentImg) {
            currentImg.setAttribute('src', url);
          }
        })
        .catch((error) => {
          console.error(`Failed to resolve image ${imageId}:`, error);
          const currentImg = editorRef.current?.querySelector(`img[data-image-id="${imageId}"]`);
          if (currentImg) {
            currentImg.setAttribute('alt', 'Failed to load image');
          }
        })
        .finally(() => {
          inFlightIdsRef.current.delete(imageId);
          const currentImg = editorRef.current?.querySelector(`img[data-image-id="${imageId}"]`);
          if (currentImg) {
            currentImg.removeAttribute('data-image-loading');
          }
        });
    });
  }, [content, imageRepository, editorRef, metaVersion]);
}
