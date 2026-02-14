import { useEffect } from "react";

/**
 * Syncs `window.visualViewport.height` to a `--vvh` CSS custom property
 * on the document element. This is the only reliable way to size elements
 * above the virtual keyboard on iOS Safari, where `dvh` units do NOT
 * respond to the keyboard — only to browser chrome (toolbar).
 *
 * Uses raw `visualViewport.height` (not offsetTop + height) because the
 * modal sets `overflow: hidden` on body, preventing iOS page scroll.
 * The visual viewport height directly equals the space above the keyboard.
 *
 * Android Chrome is handled separately via the `interactive-widget=resizes-content`
 * viewport meta tag, which makes `dvh` keyboard-aware natively.
 */
export function useVisualViewport(active: boolean): void {
  useEffect(() => {
    if (!active) return;

    const vv = window.visualViewport;
    if (!vv) return;

    function sync() {
      const vv = window.visualViewport;
      if (!vv) return;
      document.documentElement.style.setProperty("--vvh", `${vv.height}px`);
    }

    sync();
    vv.addEventListener("resize", sync);

    return () => {
      vv.removeEventListener("resize", sync);
      document.documentElement.style.removeProperty("--vvh");
    };
  }, [active]);
}
