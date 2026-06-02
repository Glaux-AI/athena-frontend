"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Observe an element's content width so the cost charts can draw axes + bars in
 * real pixel coordinates (crisp labels, no `preserveAspectRatio` distortion).
 * Returns a ref to attach and the measured width (0 until first measure).
 */
export function useMeasure<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      // Round to avoid sub-pixel churn re-rendering the SVG every frame.
      setWidth((prev) => (Math.abs(prev - w) > 0.5 ? Math.round(w) : prev));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return { ref, width };
}
