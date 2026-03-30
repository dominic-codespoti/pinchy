import { Settings } from "lucide-react";
import { Input } from "@/shared/ui/components/ui";
import { resolveProp, primaryType } from "../model";
import type { JsonSchema, SchemaProperty } from "../model";

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

interface SchemaFieldProps {
  schema: JsonSchema;
  prop: SchemaProperty;
  path: string[];
  values: Record<string, unknown>;
  onChange: (path: string[], value: unknown) => void;
}

export function SchemaField({ schema, prop, path, values, onChange }: SchemaFieldProps) {
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
