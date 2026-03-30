import { useState, useMemo, useCallback, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import yaml from "js-yaml";
import { getConfig, getConfigSchema, queryKeys, saveConfig } from "@/shared/api/client";

// Keys with dedicated UI sections or managed elsewhere
const MANAGED_KEYS = new Set(["models", "agents", "channels", "skills"]);

// ── Generic value helpers ────────────────────────────

function getPath(obj: Record<string, unknown>, path: string[]): unknown {
  let cur: unknown = obj;
  for (const key of path) {
    if (cur && typeof cur === "object" && !Array.isArray(cur)) {
      cur = (cur as Record<string, unknown>)[key];
    } else {
      return undefined;
    }
  }
  return cur;
}

function setPath(obj: Record<string, unknown>, path: string[], value: unknown): Record<string, unknown> {
  const root = JSON.parse(JSON.stringify(obj)) as Record<string, unknown>;
  let cur: Record<string, unknown> = root;
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i];
    if (!cur[key] || typeof cur[key] !== "object" || Array.isArray(cur[key])) {
      cur[key] = {};
    }
    cur = cur[key] as Record<string, unknown>;
  }
  cur[path[path.length - 1]] = value;
  return root;
}

export function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

// ── JSON-Schema helpers ──────────────────────────────

export interface SchemaProperty {
  type?: string | string[];
  description?: string;
  default?: unknown;
  anyOf?: SchemaProperty[];
  $ref?: string;
  items?: SchemaProperty;
  properties?: Record<string, SchemaProperty>;
  additionalProperties?: SchemaProperty | boolean;
  required?: string[];
}

export interface JsonSchema {
  properties?: Record<string, SchemaProperty>;
  definitions?: Record<string, SchemaProperty>;
  required?: string[];
}

export function resolveRef(schema: JsonSchema, ref: string): SchemaProperty | undefined {
  const name = ref.replace("#/definitions/", "");
  return schema.definitions?.[name];
}

export function resolveProp(schema: JsonSchema, prop: SchemaProperty): SchemaProperty {
  if (prop.$ref) {
    const resolved = resolveRef(schema, prop.$ref);
    if (resolved) return resolveProp(schema, resolved);
  }
  if (prop.anyOf) {
    const nonNull = prop.anyOf.filter((v) => {
      const t = v.type;
      return !(t === "null" || (Array.isArray(t) && t.length === 1 && t[0] === "null"));
    });
    if (nonNull.length === 1) return resolveProp(schema, nonNull[0]);
  }
  return prop;
}

export function primaryType(prop: SchemaProperty): string {
  const types = Array.isArray(prop.type) ? prop.type.filter((t) => t !== "null") : [prop.type];
  return types[0] ?? "string";
}

export type Mode = "form" | "yaml";

export function useConfigForm() {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<Mode>("form");
  const [rawYaml, setRawYaml] = useState("");
  // Single state object for the entire config
  const [values, setValues] = useState<Record<string, unknown>>({});
  // Section filter/collapse state
  const [sectionFilter, setSectionFilter] = useState("");
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());

  const toggleSection = useCallback((key: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  /** Check if a section name matches the current filter */
  const matchesFilter = useCallback((label: string) => {
    if (!sectionFilter.trim()) return true;
    return label.toLowerCase().includes(sectionFilter.toLowerCase());
  }, [sectionFilter]);

  const configQuery = useQuery({ queryKey: queryKeys.config, queryFn: getConfig });
  const schemaQuery = useQuery({
    queryKey: queryKeys.configSchema,
    queryFn: getConfigSchema,
    staleTime: Infinity,
  });

  const schema = schemaQuery.data as JsonSchema | undefined;

  // Schema-driven fields (everything except managed keys)
  const schemaFields = useMemo(() => {
    if (!schema?.properties) return [];
    return Object.entries(schema.properties)
      .filter(([key]) => !MANAGED_KEYS.has(key))
      .map(([key, prop]) => ({ key, prop }));
  }, [schema]);

  // Split into scalars (rendered in a "General" card) and objects (their own cards)
  const { scalarFields, objectFields } = useMemo(() => {
    const scalars: typeof schemaFields = [];
    const objects: typeof schemaFields = [];
    for (const field of schemaFields) {
      const resolved = schema ? resolveProp(schema, field.prop) : field.prop;
      const type = primaryType(resolved);
      if (type === "object" && resolved.properties) {
        objects.push(field);
      } else {
        scalars.push(field);
      }
    }
    return { scalarFields: scalars, objectFields: objects };
  }, [schema, schemaFields]);

  // Load config into state
  useEffect(() => {
    const cfg = configQuery.data;
    if (!cfg) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setValues(JSON.parse(JSON.stringify(cfg)));
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRawYaml(yaml.dump(cfg, { lineWidth: -1, noRefs: true, sortKeys: false }));
  }, [configQuery.data]);

  const configuredAgents = useMemo(() => {
    const agents = values.agents;
    if (!Array.isArray(agents)) return [];
    return agents.map((a) => {
      const rec = asRecord(a);
      return {
        id: typeof rec.id === "string" ? rec.id : "unknown",
        model: typeof rec.model === "string" ? rec.model : "default",
      };
    });
  }, [values]);

  // Generic path-based updater that cleans up empty parents
  const handleFieldChange = useCallback((path: string[], value: unknown) => {
    setValues((prev) => {
      let next = setPath(prev, path, value);
      // Prune empty objects/undefined at the immediate parent level
      if (value === undefined && path.length > 1) {
        const parentPath = path.slice(0, -1);
        const parent = getPath(next, parentPath);
        if (parent && typeof parent === "object" && !Array.isArray(parent)) {
          const entries = Object.entries(parent as Record<string, unknown>).filter(([, v]) => v !== undefined);
          if (entries.length === 0) {
            next = setPath(next, parentPath, undefined);
          }
        }
      }
      return next;
    });
  }, []);

  const saveMutation = useMutation({
    mutationFn: saveConfig,
    onSuccess: () => {
      toast.success("Config saved");
      void queryClient.invalidateQueries({ queryKey: queryKeys.config });
    },
    onError: (error) => {
      toast.error(`Save failed: ${error.message}`);
    },
  });

  // Build a clean payload from the values state, stripping undefined leaves
  const buildPayload = useCallback(() => {
    return JSON.parse(JSON.stringify(values, (_k, v) => (v === undefined ? undefined : v)));
  }, [values]);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = buildPayload();
    setRawYaml(yaml.dump(payload, { lineWidth: -1, noRefs: true, sortKeys: false }));
    saveMutation.mutate(payload);
  };

  const onSaveYaml = () => {
    let parsed: unknown;
    try {
      parsed = yaml.load(rawYaml);
    } catch (error) {
      toast.error(`Invalid YAML: ${(error as Error).message}`);
      return;
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      toast.error("YAML root must be a mapping/object");
      return;
    }
    saveMutation.mutate(parsed as Record<string, unknown>);
  };

  return {
    state: {
      mode,
      setMode,
      rawYaml,
      setRawYaml,
      values,
      setValues,
      sectionFilter,
      setSectionFilter,
      collapsedSections,
    },
    computed: {
      schema,
      schemaFields,
      scalarFields,
      objectFields,
      configuredAgents,
    },
    queries: {
      configQuery,
      schemaQuery,
    },
    mutations: {
      saveMutation,
    },
    actions: {
      toggleSection,
      matchesFilter,
      handleFieldChange,
      buildPayload,
      onSubmit,
      onSaveYaml,
    },
  };
}
