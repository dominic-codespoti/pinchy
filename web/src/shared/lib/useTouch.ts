import { useState, useCallback, useRef, useEffect } from "react";

export interface TouchGestureState {
  isDragging: boolean;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  deltaX: number;
  deltaY: number;
  velocity: number;
  direction: "left" | "right" | "up" | "down" | null;
}

interface UseSwipeOptions {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onSwipeUp?: () => void;
  onSwipeDown?: () => void;
  onSwipeStart?: () => void;
  onSwipeEnd?: () => void;
  threshold?: number;
  preventDefault?: boolean;
}

export function useSwipe(
  ref: React.RefObject<HTMLElement>,
  options: UseSwipeOptions
): TouchGestureState {
  const {
    onSwipeLeft,
    onSwipeRight,
    onSwipeUp,
    onSwipeDown,
    onSwipeStart,
    onSwipeEnd,
    threshold = 50,
    preventDefault = true,
  } = options;

  const [state, setState] = useState<TouchGestureState>({
    isDragging: false,
    startX: 0,
    startY: 0,
    currentX: 0,
    currentY: 0,
    deltaX: 0,
    deltaY: 0,
    velocity: 0,
    direction: null,
  });

  const startTimeRef = useRef<number>(0);
  const elementRef = useRef<HTMLElement | null>(null);

  const handleTouchStart = useCallback(
    (e: TouchEvent) => {
      if (preventDefault) e.preventDefault();
      
      const touch = e.touches[0];
      startTimeRef.current = Date.now();
      
      setState({
        isDragging: true,
        startX: touch.clientX,
        startY: touch.clientY,
        currentX: touch.clientX,
        currentY: touch.clientY,
        deltaX: 0,
        deltaY: 0,
        velocity: 0,
        direction: null,
      });

      onSwipeStart?.();
    },
    [onSwipeStart, preventDefault]
  );

  const handleTouchMove = useCallback(
    (e: TouchEvent) => {
      if (!state.isDragging) return;
      if (preventDefault) e.preventDefault();

      const touch = e.touches[0];
      const deltaX = touch.clientX - state.startX;
      const deltaY = touch.clientY - state.startY;
      const timeDelta = Date.now() - startTimeRef.current;
      const velocity = Math.sqrt(deltaX ** 2 + deltaY ** 2) / (timeDelta || 1);

      let direction: TouchGestureState["direction"] = null;
      if (Math.abs(deltaX) > Math.abs(deltaY)) {
        direction = deltaX > 0 ? "right" : "left";
      } else {
        direction = deltaY > 0 ? "down" : "up";
      }

      setState((prev) => ({
        ...prev,
        currentX: touch.clientX,
        currentY: touch.clientY,
        deltaX,
        deltaY,
        velocity,
        direction,
      }));
    },
    [state.isDragging, state.startX, state.startY, preventDefault]
  );

  const handleTouchEnd = useCallback(() => {
    if (!state.isDragging) return;

    const { deltaX, deltaY, direction } = state;
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);

    if (absX > threshold || absY > threshold) {
      if (direction === "left" && absX > threshold) onSwipeLeft?.();
      if (direction === "right" && absX > threshold) onSwipeRight?.();
      if (direction === "up" && absY > threshold) onSwipeUp?.();
      if (direction === "down" && absY > threshold) onSwipeDown?.();
    }

    setState((prev) => ({ ...prev, isDragging: false }));
    onSwipeEnd?.();
  }, [state, threshold, onSwipeLeft, onSwipeRight, onSwipeUp, onSwipeDown, onSwipeEnd]);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    elementRef.current = element;
    
    element.addEventListener("touchstart", handleTouchStart, { passive: !preventDefault });
    element.addEventListener("touchmove", handleTouchMove, { passive: !preventDefault });
    element.addEventListener("touchend", handleTouchEnd);
    element.addEventListener("touchcancel", handleTouchEnd);

    return () => {
      element.removeEventListener("touchstart", handleTouchStart);
      element.removeEventListener("touchmove", handleTouchMove);
      element.removeEventListener("touchend", handleTouchEnd);
      element.removeEventListener("touchcancel", handleTouchEnd);
    };
  }, [ref, handleTouchStart, handleTouchMove, handleTouchEnd, preventDefault]);

  return state;
}

export function usePullToRefresh(
  ref: React.RefObject<HTMLElement>,
  onRefresh: () => Promise<void>
): { isPulling: boolean; pullDistance: number; isRefreshing: boolean } {
  const [isPulling, setIsPulling] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const startYRef = useRef(0);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const handleTouchStart = (e: TouchEvent) => {
      if (element.scrollTop === 0) {
        startYRef.current = e.touches[0].clientY;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (element.scrollTop === 0 && startYRef.current > 0) {
        const delta = e.touches[0].clientY - startYRef.current;
        if (delta > 0) {
          e.preventDefault();
          setIsPulling(true);
          setPullDistance(Math.min(delta * 0.5, 100));
        }
      }
    };

    const handleTouchEnd = async () => {
      if (pullDistance > 80 && !isRefreshing) {
        setIsRefreshing(true);
        await onRefresh();
        setIsRefreshing(false);
      }
      setIsPulling(false);
      setPullDistance(0);
      startYRef.current = 0;
    };

    element.addEventListener("touchstart", handleTouchStart, { passive: true });
    element.addEventListener("touchmove", handleTouchMove, { passive: false });
    element.addEventListener("touchend", handleTouchEnd);

    return () => {
      element.removeEventListener("touchstart", handleTouchStart);
      element.removeEventListener("touchmove", handleTouchMove);
      element.removeEventListener("touchend", handleTouchEnd);
    };
  }, [ref, onRefresh, pullDistance, isRefreshing]);

  return { isPulling, pullDistance, isRefreshing };
}
