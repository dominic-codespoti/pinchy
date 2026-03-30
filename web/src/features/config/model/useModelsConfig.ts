import { useMemo, useCallback } from "react";
import { asRecord } from "./useConfigForm";

export function useModelsConfig(
  values: Record<string, unknown>,
  setValues: React.Dispatch<React.SetStateAction<Record<string, unknown>>>,
) {
  const formModels = useMemo(() => {
    const m = values.models;
    return Array.isArray(m) ? m.map((item) => asRecord(item)) : [];
  }, [values]);

  const updateModel = useCallback((index: number, key: string, value: string) => {
    setValues((prev) => {
      const currentModels = Array.isArray(prev.models) ? prev.models.map((item) => asRecord(item)) : [];
      const updated = currentModels.map((m, i) =>
        i === index ? { ...m, [key]: value || undefined } : m,
      );
      return { ...prev, models: updated };
    });
  }, [setValues]);

  const addModel = useCallback(() => {
    setValues((prev) => ({
      ...prev,
      models: [...(Array.isArray(prev.models) ? prev.models : []), { id: "", provider: "openai" }],
    }));
  }, [setValues]);

  const removeModel = useCallback((index: number) => {
    setValues((prev) => ({
      ...prev,
      models: Array.isArray(prev.models) ? prev.models.filter((_, i) => i !== index) : [],
    }));
  }, [setValues]);

  const getModelHeaders = (model: Record<string, unknown>): [string, string][] => {
    const h = model.headers;
    if (h && typeof h === "object" && !Array.isArray(h)) {
      return Object.entries(h as Record<string, unknown>).map(([k, v]) => [k, String(v ?? "")]);
    }
    return [];
  };

  const addModelHeader = useCallback((modelIndex: number) => {
    setValues((prev) => {
      const currentModels = Array.isArray(prev.models) ? prev.models.map((item) => asRecord(item)) : [];
      const updated = currentModels.map((m, i) => {
        if (i !== modelIndex) return m;
        const existing = (m.headers && typeof m.headers === "object" && !Array.isArray(m.headers))
          ? { ...(m.headers as Record<string, string>) }
          : {};
        existing[""] = "";
        return { ...m, headers: existing };
      });
      return { ...prev, models: updated };
    });
  }, [setValues]);

  const updateModelHeader = useCallback((modelIndex: number, oldKey: string, newKey: string, newValue: string) => {
    setValues((prev) => {
      const currentModels = Array.isArray(prev.models) ? prev.models.map((item) => asRecord(item)) : [];
      const updated = currentModels.map((m, i) => {
        if (i !== modelIndex) return m;
        const existing = (m.headers && typeof m.headers === "object" && !Array.isArray(m.headers))
          ? { ...(m.headers as Record<string, string>) }
          : {};
        if (oldKey !== newKey) delete existing[oldKey];
        existing[newKey] = newValue;
        return { ...m, headers: existing };
      });
      return { ...prev, models: updated };
    });
  }, [setValues]);

  const removeModelHeader = useCallback((modelIndex: number, key: string) => {
    setValues((prev) => {
      const currentModels = Array.isArray(prev.models) ? prev.models.map((item) => asRecord(item)) : [];
      const updated = currentModels.map((m, i) => {
        if (i !== modelIndex) return m;
        const existing = (m.headers && typeof m.headers === "object" && !Array.isArray(m.headers))
          ? { ...(m.headers as Record<string, string>) }
          : {};
        delete existing[key];
        const clean = Object.keys(existing).length > 0 ? existing : undefined;
        return { ...m, headers: clean };
      });
      return { ...prev, models: updated };
    });
  }, [setValues]);

  return {
    formModels,
    actions: {
      updateModel,
      addModel,
      removeModel,
      getModelHeaders,
      addModelHeader,
      updateModelHeader,
      removeModelHeader,
    },
  };
}
