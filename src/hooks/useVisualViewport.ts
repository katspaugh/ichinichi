import { useEffect } from "react";

/**
 * Syncs `window.visualViewport` geometry to a `--vvh` CSS custom property
 * on the document element. This is the only reliable way to size elements
 * above the virtual keyboard on iOS Safari, where `dvh` units do NOT
 * respond to the keyboard — only to browser chrome (toolbar).
 *
 * The value is `offsetTop + height`, i.e. the distance from the top of
 * the layout viewport to the bottom of the visual viewport (the keyboard
 * top edge). This lets a `position: fixed; top: 0` container use
 * `height: var(--vvh)` to stop exactly at the keyboard.
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
      // offsetTop accounts for iOS scrolling the page when keyboard opens.
      // The usable area from top:0 to keyboard is offsetTop + height.
      const usable = vv.offsetTop + vv.height;
      document.documentElement.style.setProperty("--vvh", `${usable}px`);
    }

    sync();
    vv.addEventListener("resize", sync);
    vv.addEventListener("scroll", sync);

    return () => {
      vv.removeEventListener("resize", sync);
      vv.removeEventListener("scroll", sync);
      document.documentElement.style.removeProperty("--vvh");
    };
  }, [active]);
}
