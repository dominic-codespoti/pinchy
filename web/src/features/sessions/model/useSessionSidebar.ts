import { useEffect, useRef, useState } from "react";

export function useSessionSidebar() {
  const [filter, setFilter] = useState("");
  const [agentOpen, setAgentOpen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);

  const listRef = useRef<HTMLDivElement | null>(null);
  const filterRef = useRef<HTMLInputElement | null>(null);
  const agentPickerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!agentOpen) return;
    const handler = (e: MouseEvent) => {
      if (agentPickerRef.current && !agentPickerRef.current.contains(e.target as Node)) {
        setAgentOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [agentOpen]);

  return {
    filter,
    setFilter,
    agentOpen,
    setAgentOpen,
    confirmingDelete,
    setConfirmingDelete,
    listRef,
    filterRef,
    agentPickerRef,
  } as const;
}
