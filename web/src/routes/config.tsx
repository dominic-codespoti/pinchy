import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Save, Trash2, Settings, FileCode, Sparkles } from "lucide-react";
import yaml from "js-yaml";
import { EditorView, lineNumbers, highlightActiveLine, highlightActiveLineGutter } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { yaml as yamlLang } from "@codemirror/lang-yaml";
import { oneDark } from "@codemirror/theme-one-dark";

import { getConfig, queryKeys, saveConfig } from "@/api/client";
import {
  Input,
  Separator,
} from "@/components/ui";

const modelSchema = z.object({
  id: z.string().min(1, "Model id is required"),
  provider: z.string().min(1, "Provider is required"),
  model: z.string().optional(),
  api_key: z.string().optional(),
  endpoint: z.string().optional(),
  api_version: z.string().optional(),
  embedding_deployment: z.string().optional(),
});

const formSchema = z.object({
  models: z.array(modelSchema),
  discordToken: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

type Mode = "form" | "yaml";

export function ConfigRoute() {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<Mode>("form");
  const [rawYaml, setRawYaml] = useState("");

  const configQuery = useQuery({ queryKey: queryKeys.config, queryFn: getConfig });

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      models: [],
      discordToken: "",
    },
  });

  const models = form.watch("models");

  useEffect(() => {
    const cfg = configQuery.data;
    if (!cfg) return;

    const modelsInput = Array.isArray(cfg.models)
      ? cfg.models.map((item) => {
          const model = asRecord(item);
          return {
            id: stringValue(model.id),
            provider: stringValue(model.provider),
            model: stringValue(model.model),
            api_key: stringValue(model.api_key),
            endpoint: stringValue(model.endpoint),
            api_version: stringValue(model.api_version),
            embedding_deployment: stringValue(model.embedding_deployment),
          };
        })
      : [];

    const channels = asRecord(cfg.channels);
    const discord = asRecord(channels.discord);

    form.reset({
      models: modelsInput,
      discordToken: secretToString(discord.token),
    });

    const yamlStr = yaml.dump(cfg, { lineWidth: -1, noRefs: true, sortKeys: false });
    setRawYaml(yamlStr);
  }, [configQuery.data, form]);

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

  const baseConfig = useMemo(() => configQuery.data ?? {}, [configQuery.data]);
  const configuredAgents = useMemo(() => {
    const cfg = configQuery.data as { agents?: unknown[] } | undefined;
    if (!cfg?.agents || !Array.isArray(cfg.agents)) return [];
    return cfg.agents
      .map((value) => asRecord(value))
      .map((agent) => ({
        id: stringValue(agent.id) || "unknown",
        model: stringValue(agent.model) || "default",
      }));
  }, [configQuery.data]);

  const onSubmit = form.handleSubmit((values) => {
    const next = deepClone(baseConfig);

    next.models = values.models.map((m) => ({
      id: m.id,
      provider: m.provider,
      model: optionalTrimmed(m.model),
      api_key: optionalTrimmed(m.api_key),
      endpoint: optionalTrimmed(m.endpoint),
      api_version: optionalTrimmed(m.api_version),
      embedding_deployment: optionalTrimmed(m.embedding_deployment),
    }));

    const channels = asRecord(next.channels);
    const discord = asRecord(channels.discord);
    discord.token = optionalTrimmed(values.discordToken) ?? "";
    channels.discord = discord;
    next.channels = channels;

    setRawYaml(yaml.dump(next, { lineWidth: -1, noRefs: true, sortKeys: false }));
    saveMutation.mutate(next);
  });

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

  const addModel = () => {
    form.setValue("models", [
      ...models,
      {
        id: "",
        provider: "openai",
        model: "",
        api_key: "",
        endpoint: "",
        api_version: "",
        embedding_deployment: "",
      },
    ]);
  };

  const removeModel = (index: number) => {
    form.setValue(
      "models",
      models.filter((_, i) => i !== index),
    );
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

        {/* ── Mode tabs ──────────────────────────── */}
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

        <div className="ml-auto">
          {configQuery.isLoading && <span className="text-[10px] text-slate-500">Loading…</span>}
          {configQuery.error && <span className="text-[10px] text-rose-400">Failed to load</span>}
        </div>
      </div>

      {/* ── Content ──────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 py-5 space-y-5">

          {mode === "form" && (
            <>
              {/* ── Models ──────────────────────────── */}
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Settings className="h-3.5 w-3.5 text-emerald-400/60" />
                    <span className="text-xs font-medium text-slate-300">Models</span>
                  </div>
                  <button
                    type="button"
                    onClick={addModel}
                    className="flex items-center gap-1 rounded-lg border border-white/[0.06] px-2 py-1 text-[10px] text-slate-400 hover:text-slate-200 hover:border-white/[0.12] transition-all duration-200"
                  >
                    <Plus className="h-3 w-3" /> Add Model
                  </button>
                </div>

                <form className="space-y-4" onSubmit={onSubmit}>
                  {models.map((_, index) => (
                    <article key={`model-${index}`} className="rounded-lg border border-white/[0.04] bg-white/[0.01] p-3 space-y-2">
                      <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                        <div>
                          <label className="text-[9px] uppercase tracking-widest text-slate-600 mb-1 block">ID</label>
                          <Input {...form.register(`models.${index}.id`)} />
                          {form.formState.errors.models?.[index]?.id && (
                            <p className="text-[10px] text-rose-400 mt-0.5">{form.formState.errors.models[index].id.message}</p>
                          )}
                        </div>
                        <div>
                          <label className="text-[9px] uppercase tracking-widest text-slate-600 mb-1 block">Provider</label>
                          <Input {...form.register(`models.${index}.provider`)} />
                          {form.formState.errors.models?.[index]?.provider && (
                            <p className="text-[10px] text-rose-400 mt-0.5">{form.formState.errors.models[index].provider.message}</p>
                          )}
                        </div>
                        <div>
                          <label className="text-[9px] uppercase tracking-widest text-slate-600 mb-1 block">Model</label>
                          <Input {...form.register(`models.${index}.model`)} />
                        </div>
                      </div>
                      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                        <div>
                          <label className="text-[9px] uppercase tracking-widest text-slate-600 mb-1 block">API Key</label>
                          <Input {...form.register(`models.${index}.api_key`)} />
                        </div>
                        <div>
                          <label className="text-[9px] uppercase tracking-widest text-slate-600 mb-1 block">Endpoint</label>
                          <Input {...form.register(`models.${index}.endpoint`)} />
                        </div>
                        <div>
                          <label className="text-[9px] uppercase tracking-widest text-slate-600 mb-1 block">API Version</label>
                          <Input {...form.register(`models.${index}.api_version`)} />
                        </div>
                        <div>
                          <label className="text-[9px] uppercase tracking-widest text-slate-600 mb-1 block">Embedding Deployment</label>
                          <Input {...form.register(`models.${index}.embedding_deployment`)} />
                        </div>
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

                  <div>
                    <label className="text-[10px] uppercase tracking-widest text-slate-500 mb-1.5 block">Discord Token</label>
                    <Input {...form.register("discordToken")} />
                  </div>

                  <button
                    type="submit"
                    disabled={saveMutation.isPending}
                    className="flex items-center gap-1.5 h-8 px-4 rounded-lg bg-emerald-400 text-slate-950 text-xs font-medium hover:bg-emerald-300 disabled:opacity-40 transition-all duration-200"
                  >
                    <Save className="h-3 w-3" />
                    {saveMutation.isPending ? "Saving..." : "Save Config"}
                  </button>
                </form>
              </div>

              {/* ── Agents summary ──────────────────── */}
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xs font-medium text-slate-300">Agents</span>
                </div>
                <div className="space-y-1">
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
              </div>
            </>
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
                        // Add blank lines between top-level keys for readability
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

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function optionalTrimmed(value: string | undefined): string | undefined {
  const next = (value ?? "").trim();
  return next.length ? next : undefined;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function secretToString(value: unknown): string {
  if (typeof value === "string") return value;
  const record = asRecord(value);
  const key = record.key;
  const source = record.source;
  if (typeof key === "string" && typeof source === "string") {
    return `${source}:${key}`;
  }
  return "";
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
