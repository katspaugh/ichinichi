import { useEffect, useRef } from "react";

interface SwipeHandlers {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
}

const MIN_SWIPE_DISTANCE = 50;
const MAX_SWIPE_DURATION = 300;

export function useSwipeGesture(
  ref: React.RefObject<HTMLElement | null>,
  { onSwipeLeft, onSwipeRight }: SwipeHandlers,
) {
  const touchStart = useRef<{ x: number; y: number; time: number } | null>(
    null,
  );

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const handleTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0];
      touchStart.current = { x: touch.clientX, y: touch.clientY, time: Date.now() };
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (!touchStart.current) return;

      const touch = e.changedTouches[0];
      const dx = touch.clientX - touchStart.current.x;
      const dy = touch.clientY - touchStart.current.y;
      const elapsed = Date.now() - touchStart.current.time;

      touchStart.current = null;

      // Ignore slow drags and vertical swipes
      if (elapsed > MAX_SWIPE_DURATION) return;
      if (Math.abs(dy) > Math.abs(dx)) return;
      if (Math.abs(dx) < MIN_SWIPE_DISTANCE) return;

      if (dx < 0) {
        onSwipeLeft?.();
      } else {
        onSwipeRight?.();
      }
    };

    el.addEventListener("touchstart", handleTouchStart, { passive: true });
    el.addEventListener("touchend", handleTouchEnd, { passive: true });

    return () => {
      el.removeEventListener("touchstart", handleTouchStart);
      el.removeEventListener("touchend", handleTouchEnd);
    };
  }, [ref, onSwipeLeft, onSwipeRight]);
}
