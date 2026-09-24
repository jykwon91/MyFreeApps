import { useLayoutEffect, useState, type RefObject } from "react";

export interface ElementSize {
  width: number;
  height: number;
}

/** An element's rendered size in px, kept current as it resizes (null before the first measure). */
export function useElementSize(ref: RefObject<HTMLElement | null>): ElementSize | null {
  const [size, setSize] = useState<ElementSize | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // The border box: what the element occupies on the page.
    function measure() {
      const { width, height } = el!.getBoundingClientRect();
      setSize((prev) => (prev && prev.width === width && prev.height === height ? prev : { width, height }));
    }
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);

  return size;
}
