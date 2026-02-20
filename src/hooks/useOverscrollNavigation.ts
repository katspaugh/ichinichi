import { useEffect, useRef } from "react";

interface OverscrollHandlers {
  onOverscrollUp?: () => void;
  onOverscrollDown?: () => void;
}

const TRIGGER_THRESHOLD = 100;
const RESISTANCE = 0.3;

export function useOverscrollNavigation(
  el: HTMLElement | null,
  { onOverscrollUp, onOverscrollDown }: OverscrollHandlers,
) {
  const touchStartY = useRef(0);
  const atBoundary = useRef<"top" | "bottom" | "both" | null>(null);
  const pulling = useRef(false);

  useEffect(() => {
    if (!el) return;

    const isAtTop = () => el.scrollTop <= 0;
    const isAtBottom = () =>
      el.scrollTop + el.clientHeight >= el.scrollHeight - 1;

    const resetTransform = () => {
      el.style.transition = "transform 200ms ease-out";
      el.style.transform = "";
      const onEnd = () => {
        el.style.transition = "";
        el.removeEventListener("transitionend", onEnd);
      };
      el.addEventListener("transitionend", onEnd);
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
        el.style.transform = `translateY(${dy * RESISTANCE}px)`;
      } else if ((b === "bottom" || b === "both") && dy < 0) {
        pulling.current = true;
        el.style.transform = `translateY(${dy * RESISTANCE}px)`;
      } else if (pulling.current) {
        el.style.transform = "";
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

    el.addEventListener("touchstart", handleTouchStart, { passive: true });
    el.addEventListener("touchmove", handleTouchMove, { passive: true });
    el.addEventListener("touchend", handleTouchEnd, { passive: true });

    return () => {
      el.removeEventListener("touchstart", handleTouchStart);
      el.removeEventListener("touchmove", handleTouchMove);
      el.removeEventListener("touchend", handleTouchEnd);
    };
  }, [el, onOverscrollUp, onOverscrollDown]);
}
