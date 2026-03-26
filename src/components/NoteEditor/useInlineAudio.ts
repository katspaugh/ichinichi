import { useEffect, useId, useRef } from "react";
import type { RefObject } from "react";
import type WaveSurfer from "wavesurfer.js";
import { useNoteRepositoryContext } from "../../contexts/noteRepositoryContext";
import { ImageUrlManager } from "../../utils/imageUrlManager";
import { createAudioPlayer } from "./AudioPlayer";

interface UseInlineAudioUrlsOptions {
  date: string;
  content: string;
  editorRef: RefObject<HTMLDivElement | null>;
}

export function useInlineAudioUrls({
  date,
  content,
  editorRef,
}: UseInlineAudioUrlsOptions) {
  const { imageRepository } = useNoteRepositoryContext();
  const managerRef = useRef<ImageUrlManager | null>(null);
  const ownerId = useId();
  const ownerIdRef = useRef(`audio-${ownerId}`);
  const currentIdsRef = useRef<Set<string>>(new Set());
  const playersRef = useRef<Map<string, WaveSurfer>>(new Map());

  // Init/cleanup URL manager
  useEffect(() => {
    if (!imageRepository) return;
    const manager = new ImageUrlManager(imageRepository);
    const oid = ownerIdRef.current;
    managerRef.current = manager;
    return () => {
      manager.releaseOwner(oid);
      managerRef.current = null;
      currentIdsRef.current = new Set();
      playersRef.current.forEach((ws) => ws.destroy());
      playersRef.current = new Map();
    };
  }, [imageRepository]);

  // Resolve audio URLs + init players
  useEffect(() => {
    const contentEl = editorRef.current;
    const manager = managerRef.current;
    if (!contentEl || !manager) return;

    const audioEls = contentEl.querySelectorAll("[data-audio-id]");
    const nextIds = new Set<string>();

    audioEls.forEach((el) => {
      const audioId = el.getAttribute("data-audio-id");
      if (!audioId || audioId === "recording") return;

      nextIds.add(audioId);

      // Already has a player
      if (playersRef.current.has(audioId)) return;

      // Replace <audio> with <div> so wavesurfer can mount
      let container: HTMLDivElement;
      if (el.tagName === "AUDIO") {
        container = document.createElement("div");
        container.setAttribute("data-audio-id", audioId);
        container.setAttribute("contenteditable", "false");
        el.replaceWith(container);
      } else {
        container = el as HTMLDivElement;
      }

      container.setAttribute("data-audio-loading", "true");

      manager
        .acquireUrl(audioId, ownerIdRef.current)
        .then((url) => {
          if (!url) return;
          // Re-query in case DOM changed
          const currentEl = contentEl.querySelector<HTMLDivElement>(
            `div[data-audio-id="${audioId}"]`,
          );
          if (!currentEl || playersRef.current.has(audioId)) return;

          while (currentEl.firstChild) currentEl.firstChild.remove();

          const ws = createAudioPlayer(currentEl, url);
          playersRef.current.set(audioId, ws);
        })
        .catch((error) => {
          console.error(`Failed to resolve audio ${audioId}:`, error);
        })
        .finally(() => {
          const currentEl = contentEl.querySelector<HTMLDivElement>(
            `div[data-audio-id="${audioId}"]`,
          );
          if (currentEl) currentEl.removeAttribute("data-audio-loading");
        });
    });

    // Release removed audio
    currentIdsRef.current.forEach((audioId) => {
      if (!nextIds.has(audioId)) {
        manager.releaseImage(audioId, ownerIdRef.current);
        const ws = playersRef.current.get(audioId);
        if (ws) {
          ws.destroy();
          playersRef.current.delete(audioId);
        }
      }
    });
    currentIdsRef.current = nextIds;
  }, [content, date, editorRef, imageRepository]);
}
