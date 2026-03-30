import { useEffect, useState, useCallback } from "react";

export interface ViewportState {
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  width: number;
  height: number;
  isPortrait: boolean;
  isLandscape: boolean;
  touchSupported: boolean;
}

const MOBILE_BREAKPOINT = 768;
const TABLET_BREAKPOINT = 1024;

export function useViewport(): ViewportState {
  const [state, setState] = useState<ViewportState>(() => ({
    isMobile: window.innerWidth < MOBILE_BREAKPOINT,
    isTablet: window.innerWidth >= MOBILE_BREAKPOINT && window.innerWidth < TABLET_BREAKPOINT,
    isDesktop: window.innerWidth >= TABLET_BREAKPOINT,
    width: window.innerWidth,
    height: window.innerHeight,
    isPortrait: window.innerHeight > window.innerWidth,
    isLandscape: window.innerWidth > window.innerHeight,
    touchSupported: "ontouchstart" in window || navigator.maxTouchPoints > 0,
  }));

  const updateViewport = useCallback(() => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    
    setState({
      isMobile: width < MOBILE_BREAKPOINT,
      isTablet: width >= MOBILE_BREAKPOINT && width < TABLET_BREAKPOINT,
      isDesktop: width >= TABLET_BREAKPOINT,
      width,
      height,
      isPortrait: height > width,
      isLandscape: width > height,
      touchSupported: "ontouchstart" in window || navigator.maxTouchPoints > 0,
    });
  }, []);

  useEffect(() => {
    updateViewport();
    
    let timeoutId: number | null = null;
    const handleResize = () => {
      if (timeoutId) window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(updateViewport, 100);
    };

    window.addEventListener("resize", handleResize);
    window.addEventListener("orientationchange", updateViewport);

    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("orientationchange", updateViewport);
      if (timeoutId) window.clearTimeout(timeoutId);
    };
  }, [updateViewport]);

  return state;
}

export function useIsMobile(): boolean {
  const { isMobile } = useViewport();
  return isMobile;
}

export function useTouchDevice(): boolean {
  const { touchSupported } = useViewport();
  return touchSupported;
}
