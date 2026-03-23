import type { JSX } from "solid-js";
import { Show } from "solid-js";

// ── PageShell ────────────────────────────────────────

export interface PageShellProps {
  header: JSX.Element;
  children: JSX.Element;
  maxWidth?: "2xl" | "3xl" | "4xl" | "5xl" | "full";
}

export function PageShell(props: PageShellProps) {
  const widthClass = () => `page-content-${props.maxWidth ?? "4xl"}`;

  return (
    <div class="page-shell">
      <div class="page-header">
        {props.header}
      </div>
      <div class="page-scroll">
        <div class={`page-content ${widthClass()}`}>
          {props.children}
        </div>
      </div>
    </div>
  );
}

// ── PageTitle ────────────────────────────────────────

export interface PageTitleProps {
  icon: JSX.Element;
  title: string;
  children?: JSX.Element;
}

export function PageTitle(props: PageTitleProps) {
  return (
    <div class="page-title-row">
      <div class="page-title-icon">{props.icon}</div>
      <h1 class="page-title">{props.title}</h1>
      <Show when={props.children}>
        <div class="page-title-actions">{props.children}</div>
      </Show>
    </div>
  );
}

// ── FormField ────────────────────────────────────────

export interface FormFieldProps {
  label: string;
  hint?: string;
  error?: string;
  inline?: boolean;
  children: JSX.Element;
}

export function FormField(props: FormFieldProps) {
  return (
    <div class="form-field" classList={{ "form-field-inline": props.inline }}>
      <Show when={!props.inline}>
        <label class="form-label">{props.label}</label>
      </Show>
      {props.children}
      <Show when={props.inline}>
        <label class="form-label">{props.label}</label>
      </Show>
      <Show when={props.hint}>
        <span class="form-hint">{props.hint}</span>
      </Show>
      <Show when={props.error}>
        <span class="form-error">{props.error}</span>
      </Show>
    </div>
  );
}
