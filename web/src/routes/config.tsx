import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Save, Trash2, Settings, FileCode, Sparkles, ChevronDown, ChevronRight, Search, X } from "lucide-react";
import yaml from "js-yaml";
import { EditorView, lineNumbers, highlightActiveLine, highlightActiveLineGutter } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { yaml as yamlLang } from "@codemirror/lang-yaml";
import { oneDark } from "@codemirror/theme-one-dark";

import { getConfig, getConfigSchema, queryKeys, saveConfig, listProviderModels } from "@/api/client";
import type { ModelInfo } from "@/api/client";
import {
  Input,
  Separator,
} from "@/components/ui";

// ── JSON-Schema helpers ──────────────────────────────

interface SchemaProperty {
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

interface JsonSchema {
  properties?: Record<string, SchemaProperty>;
  definitions?: Record<string, SchemaProperty>;
  required?: string[];
}

function resolveRef(schema: JsonSchema, ref: string): SchemaProperty | undefined {
  const name = ref.replace("#/definitions/", "");
  return schema.definitions?.[name];
}

function resolveProp(schema: JsonSchema, prop: SchemaProperty): SchemaProperty {
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

function primaryType(prop: SchemaProperty): string {
  const types = Array.isArray(prop.type) ? prop.type.filter((t) => t !== "null") : [prop.type];
  return types[0] ?? "string";
}

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

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

// ── Recursive schema field renderer ──────────────────

/** Extract a short placeholder from the description or generate one from the field name + type. */
function shortPlaceholder(fieldKey: string, type: string, desc?: string): string {
  if (desc) {
    // Pull inline examples: `"America/New_York"` or (e.g. "foo")
    const exMatch = desc.match(/(?:e\.g\.?\s*["`]([^"`]+)["`])|(?:["`]([^"`]+)["`])/);
    if (exMatch) return `e.g. ${exMatch[1] || exMatch[2]}`;
    // Pull "Default: <val>"
    const defMatch = desc.match(/Default:\s*(\S+)/i);
    if (defMatch) return `e.g. ${defMatch[1].replace(/[.]$/, "")}`;
  }
  if (type === "integer" || type === "number") return "0";
  if (type === "array") return "value1, value2, …";
  // For path-like field names, hint a path
  if (/path/i.test(fieldKey)) return "e.g. /usr/bin/…";
  if (/service/i.test(fieldKey)) return "e.g. my-service";
  if (/agent/i.test(fieldKey)) return "e.g. default";
  return "";
}

function SchemaField({
  schema,
  prop,
  path,
  values,
  onChange,
}: {
  schema: JsonSchema;
  prop: SchemaProperty;
  path: string[];
  values: Record<string, unknown>;
  onChange: (path: string[], value: unknown) => void;
}) {
  const resolved = resolveProp(schema, prop);
  const type = primaryType(resolved);
  const fieldKey = path[path.length - 1];
  const label = fieldKey.replace(/_/g, " ");
  const desc = prop.description || resolved.description;
  const rawValue = getPath(values, path);
  const placeholder = shortPlaceholder(fieldKey, type, desc);

  if (type === "object" && resolved.properties) {
    return (
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5 mb-6">
        <div className="flex items-center gap-2 mb-1">
          <Settings className="h-3.5 w-3.5 text-emerald-400/60" />
          <span className="text-xs font-medium text-slate-300 capitalize">{label}</span>
        </div>
        {desc && <p className="text-[10px] text-slate-500 mb-4">{desc}</p>}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {Object.entries(resolved.properties).map(([childKey, childProp]) => (
            <SchemaField
              key={childKey}
              schema={schema}
              prop={childProp}
              path={[...path, childKey]}
              values={values}
              onChange={onChange}
            />
          ))}
        </div>
      </div>
    );
  }

  if (type === "array") {
    const currentArr = Array.isArray(rawValue) ? rawValue : [];
    const strValue = currentArr.join(", ");
    return (
      <div className="space-y-1">
        <label className="text-[9px] uppercase tracking-widest text-slate-600 block">{label}</label>
        <Input
          value={strValue}
          onChange={(e) => {
            const arr = e.target.value.split(",").map((s) => s.trim()).filter(Boolean);
            onChange(path, arr.length > 0 ? arr : undefined);
          }}
          placeholder={placeholder}
          className="min-w-0 flex-1 bg-transparent py-2 text-sm text-slate-100 placeholder:text-slate-500/80 outline-none"
        />
        {desc && <p className="text-[10px] leading-relaxed text-slate-500 mt-1">{desc}</p>}
      </div>
    );
  }

  if (type === "boolean") {
    const checked = rawValue === true;
    return (
      <div className="space-y-1">
        <label className="flex items-center gap-2.5 cursor-pointer">
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => onChange(path, e.target.checked)}
            className="rounded border-white/10 bg-white/5 text-emerald-400 focus:ring-emerald-400/30"
          />
          <span className="text-[9px] uppercase tracking-widest text-slate-600">{label}</span>
        </label>
        {desc && <p className="text-[10px] leading-relaxed text-slate-500 ml-[26px]">{desc}</p>}
      </div>
    );
  }

  if (type === "integer" || type === "number") {
    const strVal = rawValue !== undefined && rawValue !== null ? String(rawValue) : "";
    return (
      <div className="space-y-1">
        <label className="text-[9px] uppercase tracking-widest text-slate-600 block">{label}</label>
        <Input
          type="number"
          value={strVal}
          onChange={(e) => {
            const v = e.target.value.trim();
            if (v === "") {
              onChange(path, undefined);
            } else {
              const num = Number(v);
              onChange(path, isNaN(num) ? undefined : num);
            }
          }}
          placeholder={placeholder}
        />
        {desc && <p className="text-[10px] leading-relaxed text-slate-500 mt-1">{desc}</p>}
      </div>
    );
  }

  // Default: string
  const strVal = typeof rawValue === "string" ? rawValue : rawValue !== undefined && rawValue !== null ? String(rawValue) : "";
  return (
    <div className="space-y-1">
      <label className="text-[9px] uppercase tracking-widest text-slate-600 block">{label}</label>
      <Input
        value={strVal}
        onChange={(e) => {
          const v = e.target.value;
          onChange(path, v || undefined);
        }}
        placeholder={placeholder}
      />
      {desc && <p className="text-[10px] leading-relaxed text-slate-500 mt-1">{desc}</p>}
    </div>
  );
}

// ── Main component ───────────────────────────────────

type Mode = "form" | "yaml";

/** Collapsible section wrapper for the config form */
function CollapsibleSection({
  sectionKey,
  label,
  icon: Icon,
  collapsed,
  onToggle,
  actions,
  description,
  children,
}: {
  sectionKey: string;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  collapsed: boolean;
  onToggle: (key: string) => void;
  actions?: React.ReactNode;
  description?: string;
  children: React.ReactNode;
}) {
  const Chevron = collapsed ? ChevronRight : ChevronDown;
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
      <button
        type="button"
        onClick={() => onToggle(sectionKey)}
        className="flex items-center gap-2 w-full p-5 pb-0 text-left"
      >
        <Chevron className="h-3 w-3 text-slate-600 shrink-0" />
        {Icon && <Icon className="h-3.5 w-3.5 text-emerald-400/60" />}
        <span className="text-xs font-medium text-slate-300">{label}</span>
        {actions && (
          <div className="ml-auto" onClick={(e) => e.stopPropagation()}>
            {actions}
          </div>
        )}
      </button>
      {description && !collapsed && <p className="text-[10px] text-slate-500 px-5 mt-1">{description}</p>}
      {!collapsed && <div className="p-5 pt-4">{children}</div>}
      {collapsed && <div className="h-2" />}
    </div>
  );
}

// ── Model Combobox ───────────────────────────────────

/** Combobox that lets the user type a model name or pick from discovered models. */
function ModelCombobox({
  value,
  onChange,
  configModelId,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  configModelId: string;
  placeholder?: string;
}) {
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

  const filtered = useMemo(() => {
    if (!models) return [];
    if (!value) return models;
    const lower = value.toLowerCase();
    return models.filter(
      (m) => m.id.toLowerCase().includes(lower) || m.name.toLowerCase().includes(lower),
    );
  }, [models, value]);

  return (
    <div ref={wrapperRef} className="relative">
      <div
        className={[
          "flex h-10 w-full items-center overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.03] px-3.5",
          "shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-md",
          "hover:border-white/[0.14] hover:bg-white/[0.05]",
          "focus-within:border-emerald-400/40 focus-within:bg-white/[0.05] focus-within:shadow-[0_0_0_3px_rgba(52,211,153,0.12),inset_0_1px_0_rgba(255,255,255,0.04)]",
          "transition-all duration-200 ease-out",
        ].join(" ")}
      >
        <input
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            if (models && models.length > 0) setOpen(true);
          }}
          onFocus={() => { if (models && models.length > 0) setOpen(true); }}
          placeholder={placeholder ?? "e.g. gpt-4o"}
          className="min-w-0 flex-1 bg-transparent py-2 text-sm text-slate-100 placeholder:text-slate-500/80 outline-none"
        />
        <button
          type="button"
          onClick={fetchModels}
          disabled={loading || !configModelId}
          className="ml-1 flex-shrink-0 text-slate-500 hover:text-slate-200 transition-colors duration-200 disabled:opacity-40"
          title={configModelId ? "Discover available models" : "Save the model config first (need an ID)"}
        >
          {loading ? (
            <span className="block h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-500 border-t-transparent" />
          ) : (
            <Search className="h-3.5 w-3.5" />
          )}
        </button>
      </div>
      {error && <p className="text-[10px] text-rose-400 mt-1">{error}</p>}
      {open && filtered.length > 0 && (
        <ul className="absolute z-50 mt-1 max-h-48 w-full overflow-auto rounded-md border border-white/[0.08] bg-slate-900 shadow-lg">
          {filtered.map((m) => (
            <li
              key={m.id}
              onClick={() => { onChange(m.id); setOpen(false); }}
              className={`cursor-pointer px-3 py-1.5 text-xs hover:bg-white/[0.06] flex items-center justify-between ${
                m.id === value ? "text-emerald-400" : "text-slate-300"
              }`}
            >
              <span>{m.name}</span>
              {m.vendor && <span className="text-[10px] text-slate-500">{m.vendor}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ConfigRoute() {
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
    setValues(JSON.parse(JSON.stringify(cfg)));
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

  // ── Model helpers (models have special add/remove UX) ──

  const formModels = useMemo(() => {
    const m = values.models;
    return Array.isArray(m) ? m.map((item) => asRecord(item)) : [];
  }, [values]);

  const updateModel = (index: number, key: string, value: string) => {
    const updated = formModels.map((m, i) =>
      i === index ? { ...m, [key]: value || undefined } : m,
    );
    setValues((prev) => ({ ...prev, models: updated }));
  };

  const addModel = () => {
    setValues((prev) => ({
      ...prev,
      models: [...(Array.isArray(prev.models) ? prev.models : []), { id: "", provider: "openai" }],
    }));
  };

  const removeModel = (index: number) => {
    setValues((prev) => ({
      ...prev,
      models: Array.isArray(prev.models) ? prev.models.filter((_, i) => i !== index) : [],
    }));
  };

  const getModelHeaders = (model: Record<string, unknown>): [string, string][] => {
    const h = model.headers;
    if (h && typeof h === "object" && !Array.isArray(h)) {
      return Object.entries(h as Record<string, unknown>).map(([k, v]) => [k, String(v ?? "")]);
    }
    return [];
  };

  const addModelHeader = (modelIndex: number) => {
    const updated = formModels.map((m, i) => {
      if (i !== modelIndex) return m;
      const existing = (m.headers && typeof m.headers === "object" && !Array.isArray(m.headers))
        ? { ...(m.headers as Record<string, string>) }
        : {};
      existing[""] = "";
      return { ...m, headers: existing };
    });
    setValues((prev) => ({ ...prev, models: updated }));
  };

  const updateModelHeader = (modelIndex: number, oldKey: string, newKey: string, newValue: string) => {
    const updated = formModels.map((m, i) => {
      if (i !== modelIndex) return m;
      const existing = (m.headers && typeof m.headers === "object" && !Array.isArray(m.headers))
        ? { ...(m.headers as Record<string, string>) }
        : {};
      if (oldKey !== newKey) delete existing[oldKey];
      existing[newKey] = newValue;
      return { ...m, headers: existing };
    });
    setValues((prev) => ({ ...prev, models: updated }));
  };

  const removeModelHeader = (modelIndex: number, key: string) => {
    const updated = formModels.map((m, i) => {
      if (i !== modelIndex) return m;
      const existing = (m.headers && typeof m.headers === "object" && !Array.isArray(m.headers))
        ? { ...(m.headers as Record<string, string>) }
        : {};
      delete existing[key];
      const clean = Object.keys(existing).length > 0 ? existing : undefined;
      return { ...m, headers: clean };
    });
    setValues((prev) => ({ ...prev, models: updated }));
  };

  // ── Channel helpers ──

  const channels = useMemo(() => asRecord(values.channels), [values]);
  const discord = useMemo(() => asRecord(channels.discord), [channels]);
  const defaultChannel = useMemo(() => {
    const dc = channels.default_channel;
    if (dc && typeof dc === "object" && !Array.isArray(dc)) {
      const rec = asRecord(dc);
      return { id: String(rec.id ?? ""), kind: String(rec.kind ?? "channel") };
    }
    if (typeof dc === "string") return { id: dc, kind: "channel" };
    return { id: "", kind: "channel" };
  }, [channels]);

  const secretToString = (value: unknown): string => {
    if (typeof value === "string") return value;
    const record = asRecord(value);
    const key = record.key;
    const source = record.source;
    if (typeof key === "string" && typeof source === "string") return `${source}:${key}`;
    return "";
  };

  const updateChannel = (key: string, value: unknown) => {
    setValues((prev) => {
      const ch = { ...asRecord(prev.channels) };
      if (key === "discord.token") {
        ch.discord = { ...asRecord(ch.discord), token: value || "" };
      } else if (key === "default_channel.id") {
        const existing = asRecord(ch.default_channel);
        const id = typeof value === "string" ? value.trim() : "";
        if (id) {
          ch.default_channel = { ...existing, kind: existing.kind || "channel", id };
        } else {
          delete ch.default_channel;
        }
      } else if (key === "default_channel.kind") {
        const existing = asRecord(ch.default_channel);
        if (existing.id) {
          ch.default_channel = { ...existing, kind: value };
        }
      }
      return { ...prev, channels: ch };
    });
  };

  return (
    <div className="flex flex-col h-full bg-[var(--bg)]">
      {/* ── Top bar ──────────────────────────────── */}
      <div className="flex items-center gap-2 px-4 h-12 border-b border-white/[0.06] bg-white/[0.02] backdrop-blur-sm shrink-0">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-emerald-400/10">
            <Settings className="h-3.5 w-3.5 text-emerald-400" />
          </span>
          <span className="text-sm font-semibold text-slate-100">Config</span>
        </div>

        <Separator className="!h-5 !w-px !bg-white/[0.08]" />

        <div className="flex items-center gap-0.5">
          {([
            ["form", "Form", Settings],
            ["yaml", "Raw YAML", FileCode],
          ] as const).map(([value, label, Icon]) => (
            <button
              key={value}
              type="button"
              onClick={() => setMode(value as Mode)}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition-all duration-200 ${
                mode === value
                  ? "bg-emerald-400/10 text-emerald-300"
                  : "text-slate-500 hover:text-slate-300 hover:bg-white/[0.04]"
              }`}
            >
              <Icon className="h-3 w-3" />
              {label}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2">
          {mode === "form" && (
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-600" />
              <input
                value={sectionFilter}
                onChange={(e) => setSectionFilter(e.target.value)}
                placeholder="Filter sections…"
                className="h-7 w-40 rounded-lg border border-white/[0.06] bg-white/[0.03] pl-7 pr-6 text-[11px] text-slate-300 placeholder:text-slate-600 outline-none focus:border-emerald-400/30 transition-colors"
              />
              {sectionFilter && (
                <button
                  type="button"
                  onClick={() => setSectionFilter("")}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-400"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          )}
          {configQuery.isLoading && <span className="text-[10px] text-slate-500">Loading…</span>}
          {configQuery.error && <span className="text-[10px] text-rose-400">Failed to load</span>}
        </div>
      </div>

      {/* ── Content ──────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">

          {mode === "form" && (
            <form onSubmit={onSubmit} className="space-y-6">
              {/* ── Models (special UX: add/remove) ── */}
              {matchesFilter("models") && (
              <CollapsibleSection
                sectionKey="models"
                label="Models"
                icon={Settings}
                collapsed={collapsedSections.has("models")}
                onToggle={toggleSection}
                actions={
                  <button
                    type="button"
                    onClick={addModel}
                    className="flex items-center gap-1 rounded-lg border border-white/[0.06] px-2 py-1 text-[10px] text-slate-400 hover:text-slate-200 hover:border-white/[0.12] transition-all duration-200"
                  >
                    <Plus className="h-3 w-3" /> Add Model
                  </button>
                }
              >
                <div className="space-y-5">
                  {formModels.map((model, index) => (
                    <article key={`model-${index}`} className="rounded-lg border border-white/[0.04] bg-white/[0.01] p-4 space-y-3">
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                        {(["id", "provider"] as const).map((field) => (
                          <div key={field} className="space-y-1">
                            <label className="text-[9px] uppercase tracking-widest text-slate-600 block">
                              {field === "id" ? "ID" : "Provider"}
                            </label>
                            <Input value={String(model[field] ?? "")} onChange={(e) => updateModel(index, field, e.target.value)} placeholder={field === "id" ? "e.g. gpt4" : "e.g. openai"} />
                          </div>
                        ))}
                        <div className="space-y-1">
                          <label className="text-[9px] uppercase tracking-widest text-slate-600 block">
                            Model
                          </label>
                          <ModelCombobox
                            value={String(model.model ?? "")}
                            onChange={(v) => updateModel(index, "model", v)}
                            configModelId={String(model.id ?? "")}
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        {(["api_key", "endpoint", "api_version", "embedding_deployment"] as const).map((field) => (
                          <div key={field} className="space-y-1">
                            <label className="text-[9px] uppercase tracking-widest text-slate-600 block">
                              {field.replace(/_/g, " ")}
                            </label>
                            <Input value={String(model[field] ?? "")} onChange={(e) => updateModel(index, field, e.target.value)} placeholder={field === "api_key" ? "sk-…" : field === "endpoint" ? "https://…" : field.replace(/_/g, " ")} />
                          </div>
                        ))}
                      </div>
                      {/* ── Headers (key-value rows) ── */}
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <label className="text-[9px] uppercase tracking-widest text-slate-600">Headers</label>
                          <button
                            type="button"
                            onClick={() => addModelHeader(index)}
                            className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-slate-300 transition-colors"
                          >
                            <Plus className="h-2.5 w-2.5" /> Add Row
                          </button>
                        </div>
                        {getModelHeaders(model).map(([hKey, hVal], hIdx) => (
                          <div key={`header-${hIdx}`} className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_1fr_auto] items-end">
                            <div className="space-y-1">
                              <label className="text-[9px] uppercase tracking-widest text-slate-600 block">Name</label>
                              <Input
                                value={hKey}
                                onChange={(e) => updateModelHeader(index, hKey, e.target.value, hVal)}
                                placeholder="X-Custom-Header"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[9px] uppercase tracking-widest text-slate-600 block">Value</label>
                              <Input
                                value={hVal}
                                onChange={(e) => updateModelHeader(index, hKey, hKey, e.target.value)}
                                placeholder="value"
                              />
                            </div>
                            <button
                              type="button"
                              onClick={() => removeModelHeader(index, hKey)}
                              className="mb-2 text-rose-400/50 hover:text-rose-300 transition-colors shrink-0"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={() => removeModel(index)}
                        className="flex items-center gap-1 text-[10px] text-rose-400/60 hover:text-rose-300 transition-colors"
                      >
                        <Trash2 className="h-3 w-3" /> Remove
                      </button>
                    </article>
                  ))}
                </div>
              </CollapsibleSection>
              )}

              {/* ── Channels (special: secret refs, enum kind) ── */}
              {matchesFilter("channels") && (
              <CollapsibleSection
                sectionKey="channels"
                label="Channels"
                icon={Settings}
                collapsed={collapsedSections.has("channels")}
                onToggle={toggleSection}
                description="Channel (e.g. Discord) settings."
              >
                <div className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-[9px] uppercase tracking-widest text-slate-600 block">Discord Token</label>
                    <Input
                      value={secretToString(discord.token)}
                      onChange={(e) => updateChannel("discord.token", e.target.value)}
                      placeholder="Bot token or secret ref"
                    />
                    <p className="text-[10px] leading-relaxed text-slate-500">Discord bot token. Can be a plain string or a secret reference like <code className="text-[10px] text-slate-400">env:DISCORD_TOKEN</code>.</p>
                  </div>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="space-y-1">
                      <label className="text-[9px] uppercase tracking-widest text-slate-600 block">Default Channel ID</label>
                      <Input
                        value={defaultChannel.id}
                        onChange={(e) => updateChannel("default_channel.id", e.target.value)}
                        placeholder="e.g. 123456789012345678"
                      />
                      <p className="text-[10px] leading-relaxed text-slate-500">The channel or user ID Pinchy sends messages to by default.</p>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] uppercase tracking-widest text-slate-600 block">Default Channel Kind</label>
                      <select
                        value={defaultChannel.kind}
                        onChange={(e) => updateChannel("default_channel.kind", e.target.value)}
                        className="w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-2.5 py-1.5 text-xs text-slate-200 outline-none focus:border-emerald-400/30"
                      >
                        <option value="channel">channel</option>
                        <option value="user">user (DM)</option>
                        <option value="group">group</option>
                      </select>
                      <p className="text-[10px] leading-relaxed text-slate-500">Whether the default target is a channel, DM, or group.</p>
                    </div>
                  </div>
                </div>
              </CollapsibleSection>
              )}

              {/* ── Schema-driven: General settings (scalars) ── */}
              {schema && scalarFields.length > 0 && matchesFilter("general") && (
                <CollapsibleSection
                  sectionKey="general"
                  label="General"
                  icon={Settings}
                  collapsed={collapsedSections.has("general")}
                  onToggle={toggleSection}
                  description="Instance-level settings."
                >
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    {scalarFields.map(({ key, prop }) => (
                      <SchemaField
                        key={key}
                        schema={schema}
                        prop={prop}
                        path={[key]}
                        values={values}
                        onChange={handleFieldChange}
                      />
                    ))}
                  </div>
                </CollapsibleSection>
              )}

              {/* ── Schema-driven: Object sections ── */}
              {schema && objectFields.map(({ key, prop }) => {
                const label = key.replace(/_/g, " ");
                if (!matchesFilter(label) && !matchesFilter(key)) return null;
                return (
                  <CollapsibleSection
                    key={key}
                    sectionKey={key}
                    label={label.charAt(0).toUpperCase() + label.slice(1)}
                    icon={Settings}
                    collapsed={collapsedSections.has(key)}
                    onToggle={toggleSection}
                    description={prop.description || resolveProp(schema, prop).description}
                  >
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      {Object.entries(resolveProp(schema, prop).properties ?? {}).map(([childKey, childProp]) => (
                        <SchemaField
                          key={childKey}
                          schema={schema}
                          prop={childProp}
                          path={[key, childKey]}
                          values={values}
                          onChange={handleFieldChange}
                        />
                      ))}
                    </div>
                  </CollapsibleSection>
                );
              })}

              {/* ── Agents summary ──────────────────── */}
              {matchesFilter("agents") && (
              <CollapsibleSection
                sectionKey="agents"
                label="Agents"
                icon={Settings}
                collapsed={collapsedSections.has("agents")}
                onToggle={toggleSection}
              >
                <div className="space-y-1.5">
                  {configuredAgents.map((agent) => (
                    <p key={agent.id} className="text-xs text-slate-500">
                      {agent.id} · model: {agent.model}
                    </p>
                  ))}
                  {!configuredAgents.length && (
                    <div className="flex flex-col items-center justify-center py-8 text-center">
                      <p className="text-xs text-slate-600">No agents configured</p>
                      <p className="text-[10px] text-slate-700 mt-0.5">Create an agent from the Agents page to get started.</p>
                    </div>
                  )}
                  <p className="text-[10px] text-slate-600 mt-2">Edit agent settings and files in the Agents page.</p>
                </div>
              </CollapsibleSection>
              )}

              <button
                type="submit"
                disabled={saveMutation.isPending}
                className="flex items-center gap-1.5 h-8 px-4 rounded-lg bg-emerald-400 text-slate-950 text-xs font-medium hover:bg-emerald-300 disabled:opacity-40 transition-all duration-200"
              >
                <Save className="h-3 w-3" />
                {saveMutation.isPending ? "Saving..." : "Save Config"}
              </button>
            </form>
          )}

          {mode === "yaml" && (
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-3">
              <div className="flex items-center gap-2">
                <FileCode className="h-3.5 w-3.5 text-emerald-400/60" />
                <span className="text-xs font-medium text-slate-300">Raw YAML</span>
              </div>
              <YamlEditor value={rawYaml} onChange={setRawYaml} />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    try {
                      const parsed = yaml.load(rawYaml);
                      if (parsed && typeof parsed === "object") {
                        let dumped = yaml.dump(parsed, { lineWidth: -1, noRefs: true, sortKeys: false, indent: 2 });
                        dumped = dumped.replace(/\n(?=[a-zA-Z_][\w_-]*:)/g, "\n\n");
                        setRawYaml(dumped);
                        toast.success("YAML formatted");
                      }
                    } catch (e) {
                      toast.error(`Cannot prettify: ${(e as Error).message}`);
                    }
                  }}
                  className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-slate-300 transition-colors"
                >
                  <Sparkles className="h-3 w-3" /> Prettify
                </button>
                <button
                  type="button"
                  onClick={onSaveYaml}
                  disabled={saveMutation.isPending}
                  className="flex items-center gap-1.5 h-8 px-4 rounded-lg bg-emerald-400 text-slate-950 text-xs font-medium hover:bg-emerald-300 disabled:opacity-40 transition-all duration-200"
                >
                  <Save className="h-3 w-3" />
                  {saveMutation.isPending ? "Saving..." : "Save YAML"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function YamlEditor({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!containerRef.current) return;

    const pinchyTheme = EditorView.theme({
      "&": {
        backgroundColor: "rgba(0, 0, 0, 0.3)",
        color: "#cbd5e1",
        fontSize: "12px",
        borderRadius: "8px",
        border: "1px solid rgba(255, 255, 255, 0.06)",
        minHeight: "24rem",
      },
      ".cm-content": {
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
        caretColor: "#34d399",
        padding: "8px 0",
      },
      ".cm-cursor": { borderLeftColor: "#34d399" },
      ".cm-activeLine": { backgroundColor: "rgba(255, 255, 255, 0.03)" },
      ".cm-activeLineGutter": { backgroundColor: "rgba(255, 255, 255, 0.03)" },
      ".cm-gutters": {
        backgroundColor: "rgba(0, 0, 0, 0.2)",
        color: "rgba(100, 116, 139, 0.5)",
        border: "none",
        borderRight: "1px solid rgba(255, 255, 255, 0.04)",
      },
      ".cm-selectionBackground": { backgroundColor: "rgba(52, 211, 153, 0.15) !important" },
      "&.cm-focused .cm-selectionBackground": { backgroundColor: "rgba(52, 211, 153, 0.2) !important" },
      ".cm-matchingBracket": { backgroundColor: "rgba(52, 211, 153, 0.2)", outline: "none" },
    });

    const state = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(),
        highlightActiveLine(),
        highlightActiveLineGutter(),
        yamlLang(),
        oneDark,
        pinchyTheme,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onChangeRef.current(update.state.doc.toString());
          }
        }),
        EditorView.lineWrapping,
      ],
    });

    const view = new EditorView({ state, parent: containerRef.current });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // Only create editor once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== value) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: value },
      });
    }
  }, [value]);

  return <div ref={containerRef} className="rounded-lg overflow-hidden" />;
}
