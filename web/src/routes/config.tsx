import { useState, useCallback, useEffect, useRef } from "react";
import { Save, Code, Settings, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { EditorView } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { yaml } from "@codemirror/lang-yaml";
import { oneDark } from "@codemirror/theme-one-dark";
import { useConfigQuery, useConfigSchemaQuery, useSaveConfigMutation } from "@/api/queries";
import { Card, CardHeader, CardTitle, CardContent, Button, Input, Checkbox, Skeleton } from "@/components/ui";
import { PageShell, PageTitle, FormField } from "@/components/layout";
import { cn, isRecord, coerceConfigValue, mutationOpts } from "@/lib/utils";

interface SchemaProperty {
  readonly type: string | undefined;
  readonly description: string | undefined;
  readonly default: unknown;
  readonly properties: Record<string, SchemaProperty> | undefined;
}
type Mode = "form" | "json";

/** Safely extract a SchemaProperty from unknown data */
function toSchemaProperty(val: unknown): SchemaProperty {
  if (!isRecord(val)) return { type: undefined, description: undefined, default: undefined, properties: undefined };
  return {
    type: typeof val["type"] === "string" ? val["type"] : undefined,
    description: typeof val["description"] === "string" ? val["description"] : undefined,
    default: val["default"],
    properties: isRecord(val["properties"])
      ? Object.fromEntries(
          Object.entries(val["properties"]).map(([k, v]) => [k, toSchemaProperty(v)]),
        )
      : undefined,
  };
}

/** Extract schema properties from raw schema query data */
function extractSchemaProps(data: Record<string, unknown> | undefined): Record<string, SchemaProperty> {
  if (!data) return {};
  const raw = data["properties"];
  if (!isRecord(raw)) return {};
  return Object.fromEntries(
    Object.entries(raw).map(([k, v]) => [k, toSchemaProperty(v)]),
  );
}

function SchemaField({ name, prop, value, onChange }: {
  readonly name: string; readonly prop: SchemaProperty;
  readonly value: string; readonly onChange: (n: string, v: string) => void;
}) {
  const label = name.replace(/_/g, " ");
  if (prop.type === "boolean") {
    return (
      <FormField label={label} inline>
        <Checkbox
          checked={value === "true"}
          onCheckedChange={(v) => onChange(name, String(v))}
        />
      </FormField>
    );
  }
  return (
    <FormField
      label={label}
      {...(prop.description != null ? { hint: prop.description } : {})}
    >
      <Input type={prop.type === "integer" || prop.type === "number" ? "number" : "text"}
        value={value} onChange={(e) => onChange(name, e.target.value)}
        placeholder={prop.default !== undefined ? `default: ${String(prop.default)}` : ""} />
    </FormField>
  );
}

function YamlEditor({ value, onChange }: { readonly value: string; readonly onChange: (v: string) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!containerRef.current) return;
    const theme = EditorView.theme({
      "&": {
        backgroundColor: "hsl(var(--card))",
        color: "hsl(var(--foreground))",
        fontSize: "12px",
        borderRadius: "calc(var(--radius) - 2px)",
        border: "1px solid hsl(var(--border))",
        minHeight: "20rem",
      },
      ".cm-content": {
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
        caretColor: "hsl(var(--primary))",
        padding: "8px 0",
      },
      ".cm-cursor": { borderLeftColor: "hsl(var(--primary))" },
      ".cm-activeLine": { backgroundColor: "hsl(var(--muted))" },
      ".cm-gutters": {
        backgroundColor: "hsl(var(--background))",
        color: "hsl(var(--muted-foreground))",
        border: "none",
        opacity: "0.5",
      },
    });
    const state = EditorState.create({
      doc: value,
      extensions: [
        yaml(), oneDark, theme,
        EditorView.updateListener.of((u) => { if (u.docChanged) onChangeRef.current(u.state.doc.toString()); }),
        EditorView.lineWrapping,
      ],
    });
    const view = new EditorView({ state, parent: containerRef.current });
    viewRef.current = view;
    return () => { view.destroy(); viewRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const cur = view.state.doc.toString();
    if (cur !== value) view.dispatch({ changes: { from: 0, to: cur.length, insert: value } });
  }, [value]);

  return <div ref={containerRef} className="rounded-lg overflow-hidden" />;
}

export function ConfigRoute() {
  const configQuery = useConfigQuery();
  const schemaQuery = useConfigSchemaQuery();
  const saveMutation = useSaveConfigMutation();
  const [mode, setMode] = useState<Mode>("form");
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [rawJson, setRawJson] = useState("");

  useEffect(() => {
    if (!configQuery.data) return;
    const flat: Record<string, string> = {};
    for (const [k, v] of Object.entries(configQuery.data))
      flat[k] = typeof v === "object" ? JSON.stringify(v) : String(v ?? "");
    setFormValues(flat);
    setRawJson(JSON.stringify(configQuery.data, null, 2));
  }, [configQuery.data]);

  const schemaProps = extractSchemaProps(schemaQuery.data);

  const handleFieldChange = useCallback((n: string, v: string) => {
    setFormValues((prev) => ({ ...prev, [n]: v }));
  }, []);

  const savePayload = useCallback((payload: Record<string, unknown>) => {
    saveMutation.mutate(payload, mutationOpts("Config saved"));
  }, [saveMutation]);

  const handleSaveForm = useCallback(() => {
    const payload: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(formValues)) {
      if (v === "") continue;
      try { payload[k] = JSON.parse(v); } catch {
        payload[k] = coerceConfigValue(v);
      }
    }
    savePayload(payload);
  }, [formValues, savePayload]);

  const handleSaveJson = useCallback(() => {
    let parsed: unknown;
    try { parsed = JSON.parse(rawJson); } catch (e) {
      toast.error(`Invalid JSON: ${e instanceof Error ? e.message : "parse error"}`);
      return;
    }
    if (!isRecord(parsed)) {
      toast.error("Config must be a JSON object"); return;
    }
    savePayload(parsed);
  }, [rawJson, savePayload]);

  const handleReset = useCallback(() => {
    if (!configQuery.data) return;
    const flat: Record<string, string> = {};
    for (const [k, v] of Object.entries(configQuery.data))
      flat[k] = typeof v === "object" ? JSON.stringify(v) : String(v ?? "");
    setFormValues(flat);
    setRawJson(JSON.stringify(configQuery.data, null, 2));
    toast.success("Reset to server values");
  }, [configQuery.data]);

  const modeBtn = (m: Mode, label: string, Icon: typeof Settings) => (
    <button type="button" onClick={() => setMode(m)} className={cn(
      "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition-all",
      mode === m ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground")}>
      <Icon className="h-3 w-3" />{label}
    </button>
  );

  return (
    <PageShell
      maxWidth="3xl"
      header={
        <PageTitle icon={<Settings className="h-3.5 w-3.5" />} title="Config">
          <div className="flex items-center gap-0.5">
            {modeBtn("form", "Form", Settings)}{modeBtn("json", "JSON", Code)}
          </div>
          <Button variant="ghost" size="sm" className="gap-1" onClick={handleReset}>
            <RotateCcw className="h-3 w-3" /> Reset
          </Button>
          <Button size="sm" disabled={saveMutation.isPending}
            onClick={mode === "form" ? handleSaveForm : handleSaveJson}>
            <Save className="h-3 w-3 mr-1" /> {saveMutation.isPending ? "Saving..." : "Save"}
          </Button>
        </PageTitle>
      }
    >
      {configQuery.isLoading && (
        <Card><CardContent className="space-y-3">
          <Skeleton className="h-5 w-40" /><Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-2/3" />
        </CardContent></Card>
      )}
      {configQuery.error && <p className="text-sm text-destructive">Failed to load config.</p>}
      {mode === "form" && !configQuery.isLoading && (
        <Card><CardHeader><CardTitle>Configuration</CardTitle></CardHeader>
          <CardContent><div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {Object.entries(schemaProps).map(([key, prop]) => (
              <SchemaField key={key} name={key} prop={prop} value={formValues[key] ?? ""} onChange={handleFieldChange} />
            ))}
            {Object.keys(schemaProps).length === 0 && Object.keys(formValues).map((key) => (
              <FormField key={key} label={key.replace(/_/g, " ")}>
                <Input value={formValues[key] ?? ""} onChange={(e) => handleFieldChange(key, e.target.value)} />
              </FormField>
            ))}
          </div></CardContent>
        </Card>
      )}
      {mode === "json" && !configQuery.isLoading && (
        <Card><CardHeader><CardTitle>Raw Editor</CardTitle></CardHeader>
          <CardContent><YamlEditor value={rawJson} onChange={setRawJson} /></CardContent>
        </Card>
      )}
    </PageShell>
  );
}
