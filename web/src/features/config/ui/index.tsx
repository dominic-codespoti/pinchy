import { useRef, useEffect, useState } from "react";
import { Plus, Save, Trash2, Settings, FileCode, Sparkles, Search, X } from "lucide-react";
import { toast } from "sonner";
import * as yaml from "js-yaml";
import { EditorView, lineNumbers, highlightActiveLine, highlightActiveLineGutter } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { yaml as yamlLang } from "@codemirror/lang-yaml";
import { oneDark } from "@codemirror/theme-one-dark";

import { useConfigForm, useModelsConfig, useChannelsConfig, useModelDiscovery, type Mode, resolveProp } from "../model";
import { Input, Separator } from "@/shared/ui/components/ui";
import { BottomSheet } from "@/shared/ui/components/BottomSheet";
import { useViewport } from "@/shared/lib/useViewport";
import { usePullToRefresh } from "@/shared/lib/useTouch";
import { SchemaField } from "./SchemaField";
import { CollapsibleSection } from "./CollapsibleSection";

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
  const { isMobile } = useViewport();
  const { state, refs, actions, getFiltered } = useModelDiscovery(configModelId);
  const { open, setOpen, loading, error } = state;
  const { wrapperRef } = refs;
  const { fetchModels } = actions;
  const filtered = getFiltered(value);
  const [showSheet, setShowSheet] = useState(false);

  // Mobile: Use BottomSheet
  if (isMobile) {
    return (
      <>
        <div
          onClick={() => setShowSheet(true)}
          className={[
            "flex h-12 w-full items-center overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.03] px-4",
            "shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-md",
            "hover:border-white/[0.14] hover:bg-white/[0.05]",
            "transition-all duration-200 ease-out",
            "cursor-pointer",
          ].join(" ")}
        >
          <span className={`flex-1 text-base ${value ? "text-slate-100" : "text-slate-500/80"}`}>
            {value || (placeholder ?? "Select model...")}
          </span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              fetchModels();
            }}
            disabled={loading || !configModelId}
            className="ml-2 flex-shrink-0 text-slate-500 hover:text-slate-200 transition-colors duration-200 disabled:opacity-40"
            title={configModelId ? "Discover available models" : "Save the model config first (need an ID)"}
          >
            {loading ? (
              <span className="block h-4 w-4 animate-spin rounded-full border-2 border-slate-500 border-t-transparent" />
            ) : (
              <Search className="h-4 w-4" />
            )}
          </button>
        </div>
        
        <BottomSheet
          isOpen={showSheet}
          onClose={() => setShowSheet(false)}
          title="Select Model"
          snapPoints={[60, 85]}
        >
          <div className="space-y-3">
            {filtered.length > 0 ? (
              <div className="space-y-1">
                {filtered.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => {
                      onChange(m.id);
                      setShowSheet(false);
                    }}
                    className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-left transition-colors ${
                      m.id === value ? "bg-emerald-400/10 text-emerald-400" : "text-slate-300 hover:bg-white/[0.06]"
                    }`}
                  >
                    <div>
                      <span className="block text-sm font-medium">{m.name}</span>
                      {m.vendor && <span className="block text-xs text-slate-500">{m.vendor}</span>}
                    </div>
                    {m.id === value && <span className="text-emerald-400">✓</span>}
                  </button>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <p className="text-sm text-slate-500">No models found</p>
                <p className="text-xs text-slate-600 mt-1">Try searching with the 🔍 button</p>
              </div>
            )}
            {error && <p className="text-xs text-rose-400 px-4">{error}</p>}
          </div>
        </BottomSheet>
      </>
    );
  }

  // Desktop: Original dropdown
  return (
    <div ref={wrapperRef} className="relative">
      <div
        className={[
          "flex h-10 w-full items-center overflow-hidden rounded-xl border border-white/[0.08] !bg-[#0f1520] px-3.5",
          "shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-md",
          "hover:border-white/[0.14] hover:!bg-[#141b2a]",
          "focus-within:border-emerald-400/40 focus-within:!bg-[#141b2a] focus-within:shadow-[0_0_0_3px_rgba(52,211,153,0.12),inset_0_1px_0_rgba(255,255,255,0.04)]",
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
  const { isMobile } = useViewport();
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
        fontSize: isMobile ? "14px" : "12px",
        borderRadius: "8px",
        border: "1px solid rgba(255, 255, 255, 0.06)",
        minHeight: isMobile ? "16rem" : "24rem",
        maxHeight: isMobile ? "40vh" : "60vh",
      },
      ".cm-content": {
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
        caretColor: "#34d399",
        padding: isMobile ? "12px 0" : "8px 0",
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
      // Touch-friendly scroll
      ".cm-scroller": {
        overflow: "auto",
        "-webkit-overflow-scrolling": "touch",
      },
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
  const { isMobile, touchSupported } = useViewport();
  const contentRef = useRef<HTMLDivElement>(null);
  
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
    actions: { toggleSection, matchesFilter, handleFieldChange, onSubmit, onSaveYaml, refetchConfig },
  } = {
    state,
    computed,
    queries,
    mutations,
    actions,
  };

  // Pull-to-refresh for config
  const { pullDistance, isRefreshing } = usePullToRefresh(contentRef as React.RefObject<HTMLElement>, async () => {
    await refetchConfig();
  });

  const modelsConfig = useModelsConfig(values, setValues);
  const { formModels, actions: modelActions } = modelsConfig;
  const { updateModel, addModel, removeModel, getModelHeaders, addModelHeader, updateModelHeader, removeModelHeader } = modelActions;

  const channelsConfig = useChannelsConfig(values, setValues);
  const { discord, defaultChannel, secretToString, actions: channelActions } = channelsConfig;
  const { updateChannel } = channelActions;

  return (
    <div className="flex flex-col h-full bg-[var(--bg)]">
      {/* ── Top bar ──────────────────────────────── */}
      <div className={`flex items-center gap-2 px-4 h-12 border-b border-white/[0.06] bg-white/[0.02] backdrop-blur-sm shrink-0 ${isMobile ? "h-14" : ""}`}>
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center justify-center rounded-md bg-emerald-400/10 ${isMobile ? "h-7 w-7" : "h-6 w-6"}`}>
            <Settings className={`text-emerald-400 ${isMobile ? "h-4 w-4" : "h-3.5 w-3.5"}`} />
          </span>
          <span className={`font-semibold text-slate-100 ${isMobile ? "text-base" : "text-sm"}`}>Config</span>
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
              className={`flex items-center gap-1.5 rounded-lg font-medium transition-all duration-200 ${
                isMobile ? "px-3 py-2 text-xs" : "px-2.5 py-1.5 text-[11px]"
              } ${
                mode === value
                  ? "bg-emerald-400/10 text-emerald-300"
                  : "text-slate-500 hover:text-slate-300 hover:bg-white/[0.04]"
              }`}
            >
              <Icon className={isMobile ? "h-3.5 w-3.5" : "h-3 w-3"} />
              {label}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2">
          {mode === "form" && (
            <div className={`relative ${isMobile ? "hidden" : ""}`}>
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
              <Input
                value={sectionFilter}
                onChange={(e) => setSectionFilter(e.target.value)}
                placeholder="Filter sections…"
                className="h-8 w-44 pl-9 pr-7 text-xs"
              />
              {sectionFilter && (
                <button
                  type="button"
                  onClick={() => setSectionFilter("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          )}
          {configQuery.isLoading && <span className={`text-slate-500 ${isMobile ? "text-xs" : "text-[10px]"}`}>Loading…</span>}
          {configQuery.error && <span className={`text-rose-400 ${isMobile ? "text-xs" : "text-[10px]"}`}>Failed to load</span>}
        </div>
      </div>

      {/* ── Content ──────────────────────────────── */}
      <div 
        ref={contentRef}
        className={`flex-1 overflow-y-auto ${touchSupported ? "touch-pan-y" : ""}`}
        style={{ 
          transform: pullDistance > 0 ? `translateY(${Math.min(pullDistance, 80)}px)` : undefined,
          transition: isRefreshing ? undefined : 'transform 0.2s ease-out'
        }}
      >
        <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">

          {mode === "form" && (
            <form onSubmit={onSubmit} className={`space-y-6 ${isMobile ? "pb-24" : ""}`}>
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
                    className={`flex items-center gap-1 rounded-lg border border-white/[0.06] text-slate-400 hover:text-slate-200 hover:border-white/[0.12] transition-all duration-200 ${
                      isMobile ? "px-3 py-1.5 text-xs" : "px-2 py-1 text-[10px]"
                    }`}
                  >
                    <Plus className={isMobile ? "h-3.5 w-3.5" : "h-3 w-3"} /> Add Model
                  </button>
                }
              >
                <div className="space-y-5">
                  {formModels.map((model, index) => (
                    <article key={`model-${index}`} className={`rounded-lg border border-white/[0.04] bg-white/[0.01] ${isMobile ? "p-3 space-y-4" : "p-4 space-y-3"}`}>
                      <div className={`grid grid-cols-1 gap-3 ${isMobile ? "" : "md:grid-cols-3"}`}>
                        {(["id", "provider"] as const).map((field) => (
                          <div key={field} className="space-y-2">
                            <label className={`uppercase tracking-widest text-slate-600 block ${isMobile ? "text-xs font-medium" : "text-[9px]"}`}>
                              {field === "id" ? "ID" : "Provider"}
                            </label>
                            <Input 
                              value={String(model[field] ?? "")} 
                              onChange={(e) => updateModel(index, field, e.target.value)} 
                              placeholder={field === "id" ? "e.g. gpt4" : "e.g. openai"}
                              className={isMobile ? "py-3 text-base" : ""}
                            />
                          </div>
                        ))}
                        <div className="space-y-2">
                          <label className={`uppercase tracking-widest text-slate-600 block ${isMobile ? "text-xs font-medium" : "text-[9px]"}`}>
                            Model
                          </label>
                          <ModelCombobox
                            value={String(model.model ?? "")}
                            onChange={(v) => updateModel(index, "model", v)}
                            configModelId={String(model.id ?? "")}
                          />
                        </div>
                      </div>
                      <div className={`grid grid-cols-1 gap-3 ${isMobile ? "" : "md:grid-cols-2"}`}>
                        {(["api_key", "endpoint", "api_version", "embedding_deployment"] as const).map((field) => (
                          <div key={field} className="space-y-2">
                            <label className={`uppercase tracking-widest text-slate-600 block ${isMobile ? "text-xs font-medium" : "text-[9px]"}`}>
                              {field.replace(/_/g, " ")}
                            </label>
                            <Input 
                              value={String(model[field] ?? "")} 
                              onChange={(e) => updateModel(index, field, e.target.value)} 
                              placeholder={field === "api_key" ? "sk-…" : field === "endpoint" ? "https://…" : field.replace(/_/g, " ")}
                              className={isMobile ? "py-3 text-base" : ""}
                            />
                          </div>
                        ))}
                      </div>
                      {/* ── Headers (key-value rows) ── */}
                      <div className={`space-y-3 ${isMobile ? "pt-2" : ""}`}>
                        <div className="flex items-center justify-between">
                          <label className={`uppercase tracking-widest text-slate-600 ${isMobile ? "text-xs font-medium" : "text-[9px]"}`}>Headers</label>
                          <button
                            type="button"
                            onClick={() => addModelHeader(index)}
                            className={`flex items-center gap-1 text-slate-500 hover:text-slate-300 transition-colors ${isMobile ? "text-xs px-2 py-1" : "text-[10px]"}`}
                          >
                            <Plus className={isMobile ? "h-3 w-3" : "h-2.5 w-2.5"} /> Add Row
                          </button>
                        </div>
                        {getModelHeaders(model).map(([hKey, hVal], hIdx) => (
                          <div key={`header-${hIdx}`} className={`grid grid-cols-1 gap-3 items-end ${isMobile ? "" : "md:grid-cols-[1fr_1fr_auto]"}`}>
                            <div className="space-y-2">
                              <label className={`uppercase tracking-widest text-slate-600 block ${isMobile ? "text-xs font-medium" : "text-[9px]"}`}>Name</label>
                              <Input
                                value={hKey}
                                onChange={(e) => updateModelHeader(index, hKey, e.target.value, hVal)}
                                placeholder="X-Custom-Header"
                                className={isMobile ? "py-3 text-base" : ""}
                              />
                            </div>
                            <div className="space-y-2">
                              <label className={`uppercase tracking-widest text-slate-600 block ${isMobile ? "text-xs font-medium" : "text-[9px]"}`}>Value</label>
                              <Input
                                value={hVal}
                                onChange={(e) => updateModelHeader(index, hKey, hKey, e.target.value)}
                                placeholder="value"
                                className={isMobile ? "py-3 text-base" : ""}
                              />
                            </div>
                            <button
                              type="button"
                              onClick={() => removeModelHeader(index, hKey)}
                              className={`text-rose-400/50 hover:text-rose-300 transition-colors shrink-0 ${isMobile ? "py-2 px-3" : "mb-2"}`}
                            >
                              <Trash2 className={isMobile ? "h-4 w-4" : "h-3.5 w-3.5"} />
                            </button>
                          </div>
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={() => removeModel(index)}
                        className={`flex items-center gap-1 text-rose-400/60 hover:text-rose-300 transition-colors ${isMobile ? "text-xs py-2 px-3 -ml-3" : "text-[10px]"}`}
                      >
                        <Trash2 className={isMobile ? "h-4 w-4" : "h-3 w-3"} /> Remove
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
                <div className={`space-y-4 ${isMobile ? "pt-2" : ""}`}>
                  <div className="space-y-2">
                    <label className={`uppercase tracking-widest text-slate-600 block ${isMobile ? "text-xs font-medium" : "text-[9px]"}`}>Discord Token</label>
                    <Input
                      value={secretToString(discord.token)}
                      onChange={(e) => updateChannel("discord.token", e.target.value)}
                      placeholder="Bot token or secret ref"
                      className={isMobile ? "py-3 text-base" : ""}
                    />
                    <p className={`leading-relaxed text-slate-500 ${isMobile ? "text-xs" : "text-[10px]"}`}>Discord bot token. Can be a plain string or a secret reference like <code className={`text-slate-400 ${isMobile ? "text-xs" : "text-[10px]"}`}>env:DISCORD_TOKEN</code>.</p>
                  </div>
                  <div className={`grid grid-cols-1 gap-4 ${isMobile ? "" : "md:grid-cols-2"}`}>
                    <div className="space-y-2">
                      <label className={`uppercase tracking-widest text-slate-600 block ${isMobile ? "text-xs font-medium" : "text-[9px]"}`}>Default Channel ID</label>
                      <Input
                        value={defaultChannel.id}
                        onChange={(e) => updateChannel("default_channel.id", e.target.value)}
                        placeholder="e.g. 123456789012345678"
                        className={isMobile ? "py-3 text-base" : ""}
                      />
                      <p className={`leading-relaxed text-slate-500 ${isMobile ? "text-xs" : "text-[10px]"}`}>The channel or user ID Pinchy sends messages to by default.</p>
                    </div>
                    <div className="space-y-2">
                      <label className={`uppercase tracking-widest text-slate-600 block ${isMobile ? "text-xs font-medium" : "text-[9px]"}`}>Default Channel Kind</label>
                      <select
                        value={defaultChannel.kind}
                        onChange={(e) => updateChannel("default_channel.kind", e.target.value)}
                        className={`w-full rounded-xl border border-white/[0.08] !bg-[#0f1520] text-slate-200 outline-none focus:border-emerald-400/40 focus:!bg-[#141b2a] focus:shadow-[0_0_0_3px_rgba(52,211,153,0.12),inset_0_1px_0_rgba(255,255,255,0.04)] hover:border-white/[0.14] hover:!bg-[#141b2a] transition-all duration-200 appearance-none ${isMobile ? "px-4 py-3 text-base" : "px-3.5 py-2 text-sm"}`}
                      >
                        <option value="channel">channel</option>
                        <option value="user">user (DM)</option>
                        <option value="group">group</option>
                      </select>
                      <p className={`leading-relaxed text-slate-500 ${isMobile ? "text-xs" : "text-[10px]"}`}>Whether the default target is a channel, DM, or group.</p>
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
                  <div className={`grid grid-cols-1 gap-4 ${isMobile ? "" : "md:grid-cols-2"}`}>
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
                    <div className={`grid grid-cols-1 gap-4 ${isMobile ? "" : "md:grid-cols-2"}`}>
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
                    <p key={agent.id} className={`text-slate-500 ${isMobile ? "text-sm" : "text-xs"}`}>
                      {agent.id} · model: {agent.model}
                    </p>
                  ))}
                  {!configuredAgents.length && (
                    <div className="flex flex-col items-center justify-center py-8 text-center">
                      <p className={`text-slate-600 ${isMobile ? "text-sm" : "text-xs"}`}>No agents configured</p>
                      <p className={`text-slate-700 mt-0.5 ${isMobile ? "text-xs" : "text-[10px]"}`}>Create an agent from the Agents page to get started.</p>
                    </div>
                  )}
                  <p className={`text-slate-600 mt-2 ${isMobile ? "text-xs" : "text-[10px]"}`}>Edit agent settings and files in the Agents page.</p>
                </div>
              </CollapsibleSection>
              )}

              <button
                type="submit"
                disabled={saveMutation.isPending}
                className={`flex items-center gap-1.5 rounded-lg bg-emerald-400 text-slate-950 font-medium hover:bg-emerald-300 disabled:opacity-40 transition-all duration-200 ${
                  isMobile 
                    ? "fixed bottom-6 right-4 h-12 px-5 text-sm shadow-lg shadow-emerald-400/20 z-40" 
                    : "h-8 px-4 text-xs"
                }`}
              >
                <Save className={isMobile ? "h-4 w-4" : "h-3 w-3"} />
                {saveMutation.isPending ? "Saving..." : "Save Config"}
              </button>
            </form>
          )}

          {mode === "yaml" && (
            <div className={`rounded-xl border border-white/[0.06] bg-white/[0.02] ${isMobile ? "p-3 space-y-2 pb-24" : "p-4 space-y-3"}`}>
              <div className={`flex items-center gap-2 ${isMobile ? "" : ""}`}>
                <FileCode className={`text-emerald-400/60 ${isMobile ? "h-4 w-4" : "h-3.5 w-3.5"}`} />
                <span className={`font-medium text-slate-300 ${isMobile ? "text-sm" : "text-xs"}`}>Raw YAML</span>
              </div>
              <YamlEditor value={rawYaml} onChange={setRawYaml} />
              <div className={`flex justify-end gap-2 ${isMobile ? "pb-4" : ""}`}>
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
                  className={`flex items-center gap-1 text-slate-500 hover:text-slate-300 transition-colors ${isMobile ? "text-xs px-2 py-1" : "text-[10px]"}`}
                >
                  <Sparkles className={isMobile ? "h-3.5 w-3.5" : "h-3 w-3"} /> Prettify
                </button>
                <button
                  type="button"
                  onClick={onSaveYaml}
                  disabled={saveMutation.isPending}
                  className={`flex items-center gap-1.5 rounded-lg bg-emerald-400 text-slate-950 font-medium hover:bg-emerald-300 disabled:opacity-40 transition-all duration-200 ${
                    isMobile 
                      ? "fixed bottom-6 right-4 h-12 px-5 text-sm shadow-lg shadow-emerald-400/20 z-40" 
                      : "h-8 px-4 text-xs"
                  }`}
                >
                  <Save className={isMobile ? "h-4 w-4" : "h-3 w-3"} />
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
