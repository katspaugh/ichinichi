import { useEffect } from "react";

/**
 * Syncs the distance from the top of the layout viewport to the top of the
 * virtual keyboard into a `--vvh` CSS custom property. This is the only
 * reliable way to size elements above the keyboard on iOS Safari, where
 * `dvh` units do NOT respond to the keyboard.
 *
 * The value is `offsetTop + height`: offsetTop is how far iOS has scrolled
 * the visual viewport down from the layout viewport origin, and height is
 * the visual viewport size. Together they give the usable distance from
 * a fixed top:0 element to the keyboard edge.
 *
 * Android Chrome is handled by `interactive-widget=resizes-content` in the
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
      const usable = vv.offsetTop + vv.height + 20;
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
