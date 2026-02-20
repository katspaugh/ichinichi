import { useEffect, useRef } from "react";

const SHARE_CACHE = "share-target";

/**
 * Reads images deposited by the service worker's share-target handler
 * and feeds them into the editor via the provided callback.
 * Cleans up cache and URL param after processing.
 */
export function useShareTarget(
  onFile: ((file: File) => void) | undefined,
  isReady: boolean,
) {
  const processedRef = useRef(false);

  useEffect(() => {
    if (!onFile || !isReady || processedRef.current) return;

    const params = new URLSearchParams(window.location.search);
    if (!params.has("share-target")) return;

    processedRef.current = true;

    const processSharedImages = async () => {
      try {
        const cache = await caches.open(SHARE_CACHE);
        const keys = await cache.keys();

        for (const request of keys) {
          const response = await cache.match(request);
          if (!response) continue;

          const blob = await response.blob();
          const filename =
            response.headers.get("X-Filename") || "shared-image.jpg";
          const file = new File([blob], filename, { type: blob.type });
          onFile(file);
        }

        await caches.delete(SHARE_CACHE);
      } catch (error) {
        console.error("Failed to process shared images:", error);
      }

      // Clean URL: replace ?share-target with ?date=today
      window.history.replaceState({}, "", window.location.pathname + window.location.hash);
    };

    void processSharedImages();
  }, [onFile, isReady]);
}
