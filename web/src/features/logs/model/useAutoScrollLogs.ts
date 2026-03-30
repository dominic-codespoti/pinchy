import { useEffect, useRef, useState } from "react";

export function useAutoScroll<T extends HTMLElement>(itemCount: number) {
  const listRef = useRef<T | null>(null);
  const shouldAutoScrollRef = useRef(true);
  const [showScrollBtn, setShowScrollBtn] = useState(false);

  useEffect(() => {
    if (!shouldAutoScrollRef.current) return;
    const list = listRef.current;
    if (!list) return;
    list.scrollTop = list.scrollHeight;
  }, [itemCount]);

  const scrollToBottom = () => {
    shouldAutoScrollRef.current = true;
    setShowScrollBtn(false);
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  };

  const onScroll = () => {
    if (!listRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = listRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
    shouldAutoScrollRef.current = isAtBottom;
    setShowScrollBtn(!isAtBottom);
  };

  return { listRef, showScrollBtn, scrollToBottom, onScroll };
}