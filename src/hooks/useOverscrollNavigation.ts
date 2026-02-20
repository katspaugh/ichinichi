import { useEffect, useRef } from "react";

interface OverscrollHandlers {
  onOverscrollUp?: () => void;
  onOverscrollDown?: () => void;
}

const TRIGGER_THRESHOLD = 100;
const RESISTANCE = 0.3;

export function useOverscrollNavigation(
  scrollEl: HTMLElement | null,
  transformEl: HTMLElement | null,
  { onOverscrollUp, onOverscrollDown }: OverscrollHandlers,
) {
  const touchStartY = useRef(0);
  const atBoundary = useRef<"top" | "bottom" | "both" | null>(null);
  const pulling = useRef(false);

  useEffect(() => {
    if (!scrollEl || !transformEl) return;

    const isAtTop = () => scrollEl.scrollTop <= 0;
    const isAtBottom = () =>
      scrollEl.scrollTop + scrollEl.clientHeight >= scrollEl.scrollHeight - 1;

    const resetTransform = () => {
      transformEl.style.transition = "transform 200ms ease-out";
      transformEl.style.transform = "";
      const onEnd = () => {
        transformEl.style.transition = "";
        transformEl.removeEventListener("transitionend", onEnd);
      };
      transformEl.addEventListener("transitionend", onEnd);
    };

    const handleTouchStart = (e: TouchEvent) => {
      touchStartY.current = e.touches[0].clientY;
      pulling.current = false;
      const top = isAtTop();
      const bottom = isAtBottom();
      if (top && bottom) {
        atBoundary.current = "both";
      } else if (top) {
        atBoundary.current = "top";
      } else if (bottom) {
        atBoundary.current = "bottom";
      } else {
        atBoundary.current = null;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!atBoundary.current) return;

      const dy = e.touches[0].clientY - touchStartY.current;
      const b = atBoundary.current;

      if ((b === "top" || b === "both") && dy > 0) {
        pulling.current = true;
        transformEl.style.transform = `translateY(${dy * RESISTANCE}px)`;
      } else if ((b === "bottom" || b === "both") && dy < 0) {
        pulling.current = true;
        transformEl.style.transform = `translateY(${dy * RESISTANCE}px)`;
      } else if (pulling.current) {
        transformEl.style.transform = "";
        pulling.current = false;
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (!atBoundary.current || !pulling.current) {
        atBoundary.current = null;
        return;
      }

      const dy = e.changedTouches[0].clientY - touchStartY.current;
      const b = atBoundary.current;
      atBoundary.current = null;
      pulling.current = false;

      resetTransform();

      if ((b === "top" || b === "both") && dy > TRIGGER_THRESHOLD) {
        onOverscrollUp?.();
      } else if ((b === "bottom" || b === "both") && dy < -TRIGGER_THRESHOLD) {
        onOverscrollDown?.();
      }
    };

    scrollEl.addEventListener("touchstart", handleTouchStart, {
      passive: true,
    });
    scrollEl.addEventListener("touchmove", handleTouchMove, { passive: true });
    scrollEl.addEventListener("touchend", handleTouchEnd, { passive: true });

    return () => {
      scrollEl.removeEventListener("touchstart", handleTouchStart);
      scrollEl.removeEventListener("touchmove", handleTouchMove);
      scrollEl.removeEventListener("touchend", handleTouchEnd);
    };
  }, [scrollEl, transformEl, onOverscrollUp, onOverscrollDown]);
}
