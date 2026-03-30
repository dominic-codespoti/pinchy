import { useState, useCallback, useRef, useEffect } from "react";
import { listProviderModels, type ModelInfo } from "@/shared/api/client";

export function useModelDiscovery(configModelId: string) {
  const [open, setOpen] = useState(false);
  const [models, setModels] = useState<ModelInfo[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const fetchModels = useCallback(async () => {
    if (!configModelId) return;
    setLoading(true);
    setError(null);
    try {
      const result = await listProviderModels(configModelId);
      setModels(result);
      if (result && result.length > 0) setOpen(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to fetch models");
    } finally {
      setLoading(false);
    }
  }, [configModelId]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const getFiltered = (value: string) => {
    if (!models) return [];
    if (!value) return models;
    const lower = value.toLowerCase();
    return models.filter(
      (m) => m.id.toLowerCase().includes(lower) || m.name.toLowerCase().includes(lower),
    );
  };

  return {
    state: { open, setOpen, models, loading, error },
    refs: { wrapperRef },
    actions: { fetchModels },
    getFiltered,
  };
}
