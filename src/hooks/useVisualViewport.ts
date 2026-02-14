import { useEffect } from "react";

/**
 * Syncs `window.visualViewport.height` to a `--vvh` CSS custom property
 * on the document element. This is the only reliable way to size elements
 * above the virtual keyboard on iOS Safari, where `dvh` units do NOT
 * respond to the keyboard — only to browser chrome (toolbar).
 *
 * Android Chrome is handled separately via the `interactive-widget=resizes-content`
 * viewport meta tag, which makes `dvh` keyboard-aware natively.
 *
 * Activate this hook when a full-screen overlay (e.g., modal) is open,
 * so the CSS var is kept up to date while the keyboard might appear.
 * The var is cleared on cleanup to avoid stale values.
 */
export function useVisualViewport(active: boolean): void {
  useEffect(() => {
    if (!active) return;

    const vv = window.visualViewport;
    if (!vv) return;

    function sync() {
      const height = window.visualViewport?.height;
      if (height != null) {
        document.documentElement.style.setProperty(
          "--vvh",
          `${height}px`,
        );
      }
    }

    sync();
    vv.addEventListener("resize", sync);

    return () => {
      vv.removeEventListener("resize", sync);
      document.documentElement.style.removeProperty("--vvh");
    };
  }, [active]);
}
