import { useEffect, useRef } from "react";

interface OverscrollHandlers {
  onOverscrollUp?: () => void;
  onOverscrollDown?: () => void;
}

const TRIGGER_THRESHOLD = 100;
const RESISTANCE = 0.3;

export function useOverscrollNavigation(
  ref: React.RefObject<HTMLElement | null>,
  { onOverscrollUp, onOverscrollDown }: OverscrollHandlers,
) {
  const touchStartY = useRef(0);
  const atBoundary = useRef<"top" | "bottom" | null>(null);
  const pulling = useRef(false);

  useEffect(() => {
    const el = ref.current;
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
      if (isAtTop()) {
        atBoundary.current = "top";
      } else if (isAtBottom()) {
        atBoundary.current = "bottom";
      } else {
        atBoundary.current = null;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!atBoundary.current) return;

      const dy = e.touches[0].clientY - touchStartY.current;

      // Pull down at top → previous
      if (atBoundary.current === "top" && dy > 0) {
        pulling.current = true;
        const offset = dy * RESISTANCE;
        el.style.transform = `translateY(${offset}px)`;
      }
      // Pull up at bottom → next
      else if (atBoundary.current === "bottom" && dy < 0) {
        pulling.current = true;
        const offset = dy * RESISTANCE;
        el.style.transform = `translateY(${offset}px)`;
      } else if (pulling.current) {
        // Finger moved back past origin — reset
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
      const boundary = atBoundary.current;
      atBoundary.current = null;
      pulling.current = false;

      resetTransform();

      if (boundary === "top" && dy > TRIGGER_THRESHOLD) {
        onOverscrollUp?.();
      } else if (boundary === "bottom" && dy < -TRIGGER_THRESHOLD) {
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
  }, [ref, onOverscrollUp, onOverscrollDown]);
}
