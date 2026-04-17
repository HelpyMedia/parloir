"use client";

import { useEffect, useState } from "react";

/**
 * Returns true once the window has scrolled past `threshold` pixels.
 * Used to collapse the top stage band into a compact sticky bar on scroll.
 */
export function useScrollCollapse(threshold = 120): boolean {
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    const onScroll = () => {
      setCollapsed(window.scrollY > threshold);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [threshold]);
  return collapsed;
}
