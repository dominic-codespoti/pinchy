import { useCallback, useEffect, useRef, useState } from "react";

export function useRevealStream(scrollToBottom: (force?: boolean) => void) {
  const streamBufferRef = useRef("");
  const revealedLenRef = useRef(0);
  const revealRafRef = useRef<number | null>(null);
  const isStreamingRef = useRef(false);
  const pendingFinalizeRef = useRef<(() => void) | null>(null);

  const [displayedStream, setDisplayedStream] = useState("");

  const appendDelta = useCallback((delta: string) => {
    streamBufferRef.current += delta;
    isStreamingRef.current = true;
    setDisplayedStream(streamBufferRef.current);
  }, []);

  const finalizeStream = useCallback((finalizeFn?: () => void) => {
    isStreamingRef.current = false;
    if (finalizeFn) pendingFinalizeRef.current = finalizeFn;
    if (!streamBufferRef.current) {
      if (pendingFinalizeRef.current) {
        pendingFinalizeRef.current();
        pendingFinalizeRef.current = null;
      }
    } else {
      setDisplayedStream(streamBufferRef.current);
    }
  }, []);

  const reset = useCallback(() => {
    streamBufferRef.current = "";
    revealedLenRef.current = 0;
    isStreamingRef.current = false;
    pendingFinalizeRef.current = null;
    setDisplayedStream("");
    if (revealRafRef.current) {
      cancelAnimationFrame(revealRafRef.current);
      revealRafRef.current = null;
    }
  }, []);

  useEffect(() => {
    const CHARS_PER_FRAME = 3;

    const tick = () => {
      const full = streamBufferRef.current;
      if (revealedLenRef.current < full.length) {
        revealedLenRef.current = Math.min(revealedLenRef.current + CHARS_PER_FRAME, full.length);
        setDisplayedStream(full.slice(0, revealedLenRef.current));
        scrollToBottom(true);
        revealRafRef.current = requestAnimationFrame(tick);
      } else if (!isStreamingRef.current && full.length > 0) {
        revealRafRef.current = null;
        if (pendingFinalizeRef.current) {
          pendingFinalizeRef.current();
          pendingFinalizeRef.current = null;
        }
      } else if (isStreamingRef.current) {
        revealRafRef.current = requestAnimationFrame(tick);
      } else {
        revealRafRef.current = null;
      }
    };

    if (isStreamingRef.current || (streamBufferRef.current.length > 0 && revealedLenRef.current < streamBufferRef.current.length)) {
      if (!revealRafRef.current) revealRafRef.current = requestAnimationFrame(tick);
    }

    return () => {
      if (revealRafRef.current) {
        cancelAnimationFrame(revealRafRef.current);
        revealRafRef.current = null;
      }
    };
  }, [scrollToBottom]);

  return { displayedStream, appendDelta, finalizeStream, streamBufferRef, reset } as const;
}
