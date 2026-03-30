import { useRef, useEffect } from "react";
import { Plus, Save, Trash2, Settings, FileCode, Sparkles, ChevronDown, ChevronRight, Search, X } from "lucide-react";
import { toast } from "sonner";
import * as yaml from "js-yaml";
import { EditorView, lineNumbers, highlightActiveLine, highlightActiveLineGutter } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { yaml as yamlLang } from "@codemirror/lang-yaml";
import { oneDark } from "@codemirror/theme-one-dark";

import { useConfigForm, useModelsConfig, useChannelsConfig, useModelDiscovery, type JsonSchema, type SchemaProperty, type Mode, resolveProp, primaryType } from "../model";
import { Input, Separator } from "@/shared/ui/components/ui";

// ── Schema field renderer ─────────────────────────────

/** Extract a short placeholder from the description or generate one from the field name + type. */
function shortPlaceholder(fieldKey: string, type: string, desc?: string): string {
  if (desc) {
    const exMatch = desc.match(/(?:e\.g\.?\s*["`]([^"`]+)["`])|(?:["`]([^"`]+)["`])/);
    if (exMatch) return `e.g. ${exMatch[1] || exMatch[2]}`;
    const defMatch = desc.match(/Default:\s*(\S+)/i);
    if (defMatch) return `e.g. ${defMatch[1].replace(/[.]$/, "")}`;
  }
  if (type === "integer" || type === "number") return "0";
  if (type === "array") return "value1, value2, …";
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

// ── Collapsible section wrapper ──────────────────────

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
  const { state, refs, actions, getFiltered } = useModelDiscovery(configModelId);
  const { open, setOpen, loading, error } = state;
  const { wrapperRef } = refs;
  const { fetchModels } = actions;
  const filtered = getFiltered(value);

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
          }}
          onFocus={() => { if (filtered.length > 0) setOpen(true); }}
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

// ── YAML Editor ────────────────────────────────────────

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

// ── Main component ───────────────────────────────────

export function ConfigRoute() {
  const {
    state,
    computed,
    queries,
    mutations,
    actions,
  } = useConfigForm();

  const {
    state: { mode, setMode, rawYaml, setRawYaml, values, setValues, sectionFilter, setSectionFilter, collapsedSections },
    computed: { schema, scalarFields, objectFields, configuredAgents },
    queries: { configQuery },
    mutations: { saveMutation },
    actions: { toggleSection, matchesFilter, handleFieldChange, onSubmit, onSaveYaml },
  } = {
    state,
    computed,
    queries,
    mutations,
    actions,
  };

  const modelsConfig = useModelsConfig(values, setValues);
  const { formModels, actions: modelActions } = modelsConfig;
  const { updateModel, addModel, removeModel, getModelHeaders, addModelHeader, updateModelHeader, removeModelHeader } = modelActions;

  const channelsConfig = useChannelsConfig(values, setValues);
  const { discord, defaultChannel, secretToString, actions: channelActions } = channelsConfig;
  const { updateChannel } = channelActions;

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
                        const dumped = yaml.dump(parsed, { lineWidth: -1, noRefs: true, sortKeys: false, indent: 2 });
                        const formatted = dumped.replace(/\n(?=[a-zA-Z_][\w_-]*:)/g, "\n\n");
                        setRawYaml(formatted);
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
