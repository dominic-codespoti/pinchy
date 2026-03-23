import { A } from "@solidjs/router";
import { Effect } from "effect";
import {
  createEffect,
  createMemo,
  createSignal,
  For,
  onCleanup,
  Show,
} from "solid-js";
import {
  Bot,
  Code,
  ExternalLink,
  Eye,
  EyeOff,
  Github,
  KeyRound,
  Package,
  Plus,
  RefreshCw,
  Save,
  Settings,
  Trash2,
  Loader,
} from "@/components/icons";
import { PageShell, PageTitle, FormField } from "@/components/layout";
import { createMutation, createQuery, invalidateQueries } from "@/api/use-api";
import {
  chatGptLogout,
  fetchConfig,
  fetchDiscoveredModels,
  fetchProviderAuthStatus,
  qk,
  saveConfig,
  startChatGptLogin,
  startCopilotLogin,
} from "@/api/queries";
import type { ModelsResponse, ProviderAuthStatus } from "@/api/schemas";
import { HttpError } from "@/api/http";
import { toast } from "@/components/toast";
import { onGatewayEvent } from "@/api/gateway";
import { isRecord } from "@/lib/utils";

type Mode = "structured" | "raw";
type ConfigDraft = Record<string, unknown>;
type DraftRecord = Record<string, unknown>;
type ModelProviderKind = (typeof MODEL_PROVIDER_OPTIONS)[number]["value"];

type CopilotLoginState = {
  readonly login_id: string;
  readonly status: string;
  readonly verification_uri: string | null;
  readonly user_code: string | null;
  readonly error: string | null;
};

type ChatGptLoginState = {
  readonly login_id: string;
  readonly status: string;
  readonly auth_url: string | null;
  readonly error: string | null;
};

const MODEL_PROVIDER_OPTIONS = [
  { value: "copilot", label: "Copilot" },
  { value: "openai", label: "OpenAI" },
  { value: "openai-chatgpt", label: "ChatGPT (OAuth)" },
  { value: "azure-openai", label: "Azure OpenAI" },
  { value: "openai-compat", label: "OpenAI Compatible" },
] as const;

const CHATGPT_MODEL_OPTIONS = [
  { id: "gpt-5.4", label: "GPT-5.4" },
  { id: "gpt-5.4-mini", label: "GPT-5.4 Mini" },
  { id: "gpt-5.3-codex", label: "GPT-5.3 Codex" },
  { id: "gpt-5.3-codex-spark", label: "GPT-5.3 Codex Spark" },
  { id: "gpt-5.2-codex", label: "GPT-5.2 Codex" },
  { id: "gpt-5.1-codex-max", label: "GPT-5.1 Codex Max" },
  { id: "gpt-5.1-codex", label: "GPT-5.1 Codex" },
  { id: "gpt-5-codex", label: "GPT-5 Codex" },
  { id: "gpt-5-codex-mini", label: "GPT-5 Codex Mini" },
] as const;

const SESSION_EXPIRY_PRESETS = [
  { value: 30, label: "30 days (default)" },
  { value: 7, label: "7 days" },
  { value: 90, label: "90 days" },
  { value: 0, label: "Off" },
] as const;

const CRON_EXPIRY_PRESETS = [
  { value: 7, label: "7 days (default)" },
  { value: 1, label: "1 day" },
  { value: 30, label: "30 days" },
  { value: 0, label: "Off" },
] as const;

const CRON_EVENTS_PRESETS = [
  { value: 50, label: "50 (default)" },
  { value: 100, label: "100" },
  { value: 250, label: "250" },
  { value: 500, label: "500" },
] as const;

function getProviderKind(value: unknown): ModelProviderKind {
  const provider = getString(value).trim().toLowerCase();
  if (provider === "copilot") return "copilot";
  if (provider === "openai") return "openai";
  if (
    provider === "openai-chatgpt"
    || provider === "openai_chatgpt"
    || provider === "openai-codex"
  ) {
    return "openai-chatgpt";
  }
  if (
    provider === "azure-openai"
    || provider === "azure_openai"
    || provider === "azure"
  ) {
    return "azure-openai";
  }
  return "openai-compat";
}

function getProviderLabel(value: unknown): string {
  const provider = getProviderKind(value);
  return MODEL_PROVIDER_OPTIONS.find((option) => option.value === provider)?.label
    ?? "OpenAI Compatible";
}

function supportsDynamicModelDiscovery(provider: ModelProviderKind): boolean {
  return provider === "copilot" || provider === "openai" || provider === "openai-compat";
}

function getStaticModelOptions(provider: ModelProviderKind) {
  if (provider === "openai-chatgpt") return CHATGPT_MODEL_OPTIONS;
  return [] as const;
}

function cloneDraft<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function stringifyDraft(value: Record<string, unknown>): string {
  return JSON.stringify(value, null, 2);
}

function getRecordValue(value: unknown): DraftRecord {
  return isRecord(value) ? value : {};
}

function getRecordArray(value: unknown): DraftRecord[] {
  return Array.isArray(value)
    ? value.filter((item): item is DraftRecord => isRecord(item))
    : [];
}

function getString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function getStringRecord(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => typeof entry === "string"),
  ) as Record<string, string>;
}

function getNumberText(value: unknown): string {
  return typeof value === "number" ? String(value) : "";
}

function getBoolean(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function getStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function joinLines(value: unknown): string {
  return getStringArray(value).join("\n");
}

function parseLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function nextHeaderKey(value: unknown): string {
  const headers = getStringRecord(value);
  let index = Object.keys(headers).length + 1;
  let candidate = `x-header-${index}`;
  while (candidate in headers) {
    index += 1;
    candidate = `x-header-${index}`;
  }
  return candidate;
}

function getSecretInputValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (isRecord(value)) return JSON.stringify(value);
  return "";
}

function setOptionalString(target: DraftRecord, key: string, value: string) {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    delete target[key];
    return;
  }
  target[key] = value;
}

function setOptionalNumber(target: DraftRecord, key: string, value: string) {
  if (value.length === 0) {
    delete target[key];
    return;
  }
  const parsed = Number(value);
  if (Number.isFinite(parsed)) target[key] = parsed;
}

function setOptionalBoolean(
  target: DraftRecord,
  key: string,
  value: boolean,
  defaultValue: boolean,
) {
  if (value === defaultValue) {
    delete target[key];
    return;
  }
  target[key] = value;
}

function setOptionalStringList(target: DraftRecord, key: string, text: string) {
  const values = parseLines(text);
  if (values.length === 0) {
    delete target[key];
    return;
  }
  target[key] = values;
}

function setOptionalRecord(target: DraftRecord, key: string, value: DraftRecord) {
  if (Object.keys(value).length === 0) {
    delete target[key];
    return;
  }
  target[key] = value;
}

function setOptionalModelField(target: DraftRecord, key: string, value: string) {
  if (key === "provider") {
    target[key] = getProviderKind(value);
    return;
  }
  if (key === "auth_mode") {
    setOptionalString(target, key, value);
    if (value === "entra_id") delete target["api_key"];
    return;
  }
  setOptionalString(target, key, value);
}

function normalizeModelForProvider(model: DraftRecord, provider: ModelProviderKind) {
  model["provider"] = provider;
  if (provider !== "azure-openai") delete model["auth_mode"];
}

function getConfigIssues(draft: ConfigDraft): string[] {
  const issues: string[] = [];
  const models = getRecordArray(draft["models"]);
  if (!Array.isArray(draft["models"])) issues.push("Models must be a list.");
  if (
    models.some(
      (model) => getString(model["id"]).trim().length === 0
        || getString(model["provider"]).trim().length === 0,
    )
  ) {
    issues.push("Each model needs an id and provider.");
  }
  if (!Array.isArray(draft["agents"])) issues.push("Agents must be a list.");
  if (!isRecord(draft["channels"])) issues.push("Channels must be an object.");
  const channels = getRecordValue(draft["channels"]);
  const defaultChannel = getRecordValue(channels["default_channel"]);
  if (
    Object.keys(defaultChannel).length > 0
    && (
      getString(defaultChannel["id"]).trim().length === 0
      || getString(defaultChannel["kind"]).trim().length === 0
    )
  ) {
    issues.push("Default channel needs kind and id.");
  }
  return issues;
}

function getConfigErrorMessage(error: unknown): string {
  if (error instanceof HttpError) {
    try {
      const parsed = JSON.parse(error.body) as { error?: unknown };
      if (typeof parsed.error === "string" && parsed.error.length > 0) {
        return parsed.error;
      }
    } catch {
      // ignore invalid JSON body
    }
    return error.message;
  }
  if (error instanceof Error) return error.message;
  return "Something went wrong.";
}

function nextModelId(models: readonly DraftRecord[]): string {
  let index = 1;
  let candidate = `model_${index}`;
  const ids = models.map((model) => getString(model["id"]).toLowerCase());
  while (ids.includes(candidate.toLowerCase())) {
    index += 1;
    candidate = `model_${index}`;
  }
  return candidate;
}

function SectionCard(props: {
  readonly title: string;
  readonly action?: unknown;
  readonly children: unknown;
}) {
  return (
    <div class="config-section">
      <div class="config-section-header">
        <h3 class="config-section-title">{props.title}</h3>
        <Show when={props.action}>{props.action as any}</Show>
      </div>
      <div class="config-section-body">{props.children as any}</div>
    </div>
  );
}

function InlineAlert(props: { readonly message: string }) {
  return <div class="config-inline-alert">{props.message}</div>;
}

function SummaryBadge(props: { readonly text: string }) {
  return <span class="config-summary-badge">{props.text}</span>;
}

function SecretInput(props: {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly placeholder?: string;
}) {
  const [revealed, setRevealed] = createSignal(false);
  return (
    <div class="config-secret-wrapper">
      <input
        class="input"
        type={revealed() ? "text" : "password"}
        value={props.value}
        placeholder={props.placeholder}
        onInput={(e) => props.onChange(e.currentTarget.value)}
      />
      <button
        type="button"
        class="config-secret-toggle"
        onClick={() => setRevealed((prev) => !prev)}
        aria-label={revealed() ? "Hide secret" : "Show secret"}
      >
        <Show when={revealed()} fallback={<Eye size={14} />}>
          <EyeOff size={14} />
        </Show>
      </button>
    </div>
  );
}

function PresetNumberField(props: {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly options: ReadonlyArray<{ readonly value: number; readonly label: string }>;
  readonly placeholder?: string;
}) {
  const selectValue = createMemo(() =>
    props.options.some((option) => String(option.value) === props.value)
      ? props.value
      : "__custom__"
  );

  return (
    <FormField label={props.label}>
      <div class="config-preset-row">
        <select
          class="select"
          value={selectValue()}
          onChange={(e) => {
            const next = e.currentTarget.value;
            if (next === "__custom__") return;
            props.onChange(next);
          }}
        >
          <For each={props.options}>
            {(option) => <option value={String(option.value)}>{option.label}</option>}
          </For>
          <option value="__custom__">Custom</option>
        </select>
        <input
          class="input"
          type="number"
          value={props.value}
          placeholder={props.placeholder}
          onInput={(e) => props.onChange(e.currentTarget.value)}
        />
      </div>
    </FormField>
  );
}

function HeaderRows(props: {
  readonly headers: Record<string, string>;
  readonly onChange: (headers: Record<string, string>) => void;
}) {
  const entries = createMemo(() => Object.entries(props.headers));

  function updateHeader(index: number, key: string, value: string) {
    const nextEntries = entries().map(([entryKey, entryValue]) =>
      [entryKey, entryValue] as const
    );
    nextEntries[index] = [key, value];
    const next: Record<string, string> = {};
    for (const [entryKey, entryValue] of nextEntries) {
      const trimmedKey = entryKey.trim();
      if (trimmedKey.length > 0) next[trimmedKey] = entryValue;
    }
    props.onChange(next);
  }

  function removeHeader(index: number) {
    const nextEntries = entries().filter((_, entryIndex) => entryIndex !== index);
    props.onChange(Object.fromEntries(nextEntries));
  }

  return (
    <div style={{ display: "flex", "flex-direction": "column", gap: "var(--space-2)" }}>
      <For each={entries()}>
        {([key, value], index) => (
          <div class="config-header-row">
            <input
              class="input"
              value={key}
              placeholder="Header"
              onInput={(e) => updateHeader(index(), e.currentTarget.value, value)}
            />
            <input
              class="input"
              value={value}
              placeholder="Value"
              onInput={(e) => updateHeader(index(), key, e.currentTarget.value)}
            />
            <button
              type="button"
              class="btn btn-ghost btn-sm btn-icon"
              style={{ color: "var(--destructive)" }}
              onClick={() => removeHeader(index())}
              aria-label="Remove header"
            >
              <Trash2 size={14} />
            </button>
          </div>
        )}
      </For>
    </div>
  );
}

function ProviderAuthInput(props: {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly defaultEnvVar: string;
  readonly inlinePlaceholder: string;
}) {
  const mode = createMemo(() => {
    const trimmed = props.value.trim();
    return trimmed.length === 0 || trimmed.startsWith("$") ? "env" : "inline";
  });

  const envValue = createMemo(() => {
    const trimmed = props.value.trim();
    return trimmed.startsWith("$") ? trimmed.slice(1) : props.defaultEnvVar;
  });

  return (
    <div class="config-auth-input-row">
      <select
        class="select"
        value={mode()}
        onChange={(e) => {
          const next = e.currentTarget.value;
          if (next === "env") {
            props.onChange(`$${envValue() || props.defaultEnvVar}`);
            return;
          }
          if (mode() === "env") props.onChange("");
        }}
      >
        <option value="env">Environment</option>
        <option value="inline">Inline key</option>
      </select>

      <Show
        when={mode() === "env"}
        fallback={
          <SecretInput
            value={props.value.trim().startsWith("$") ? "" : props.value}
            onChange={props.onChange}
            placeholder={props.inlinePlaceholder}
          />
        }
      >
        <input
          class="input"
          value={envValue()}
          placeholder={props.defaultEnvVar}
          onInput={(e) => {
            const next = e.currentTarget.value.trim().replace(/^\$+/, "");
            props.onChange(next.length > 0 ? `$${next}` : "");
          }}
        />
      </Show>
    </div>
  );
}

function ModelDiscoverySelect(props: {
  readonly options: ReadonlyArray<{ readonly id: string; readonly label: string }>;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly isLoading: boolean;
  readonly disabled?: boolean;
  readonly error?: string | null;
}) {
  const selectValue = createMemo(() =>
    props.options.some((option) => option.id === props.value)
      ? props.value
      : "__custom__"
  );

  return (
    <Show
      when={props.options.length > 0}
      fallback={
        <input
          class="input"
          value={props.value}
          placeholder={props.isLoading ? "Loading models..." : "gpt-4o"}
          disabled={props.disabled}
          onInput={(e) => props.onChange(e.currentTarget.value)}
        />
      }
    >
      <div class="config-discovery-row">
        <select
          class="select"
          value={selectValue()}
          disabled={props.disabled || props.isLoading}
          onChange={(e) => {
            const next = e.currentTarget.value;
            if (next === "__custom__") return;
            props.onChange(next);
          }}
        >
          <For each={props.options}>
            {(option) => <option value={option.id}>{option.label}</option>}
          </For>
          <option value="__custom__">Custom</option>
        </select>
        <input
          class="input"
          value={props.value}
          placeholder={props.error ? "Manual model id" : "gpt-4o"}
          disabled={props.disabled}
          onInput={(e) => props.onChange(e.currentTarget.value)}
        />
      </div>
    </Show>
  );
}

function ChatGptModelFields(props: {
  readonly providerAuth: ProviderAuthStatus | undefined;
  readonly onStatusChanged: () => void;
}) {
  const startChatGptLoginMut = createMutation({
    fn: () => startChatGptLogin(),
    onSuccess: (result) => {
      if (result.auth_url) window.open(result.auth_url, "_blank", "noopener,noreferrer");
    },
    onError: (msg) => toast.error(msg),
  });

  const chatGptLogoutMut = createMutation({
    fn: () => chatGptLogout(),
    onSuccess: () => {
      toast.success("ChatGPT logged out");
      props.onStatusChanged();
    },
    onError: (msg) => toast.error(msg),
  });

  const chatgpt = createMemo(() => props.providerAuth?.openai_chatgpt);
  const isAuthenticated = createMemo(() => chatgpt()?.authenticated === true);

  return (
    <div class="config-chatgpt-panel">
      <div class="config-chatgpt-panel-header">
        <div>
          <div class="config-chatgpt-panel-title">ChatGPT OAuth</div>
          <div class="config-chatgpt-panel-desc">
            <Show
              when={isAuthenticated()}
              fallback={"Sign in with your ChatGPT account to authenticate this provider"}
            >
              {chatgpt()?.needs_refresh
                ? "Authenticated (token will auto-refresh on next request)"
                : "Authenticated - uses your ChatGPT subscription at zero extra cost"}
            </Show>
          </div>
        </div>
        <span class={`config-provider-badge ${isAuthenticated() ? "config-provider-badge-connected" : "config-provider-badge-disconnected"}`}>
          {isAuthenticated() ? "Connected" : "Not connected"}
        </span>
      </div>

      <Show
        when={isAuthenticated()}
        fallback={
          <button
            type="button"
            class="btn btn-outline btn-sm"
            disabled={startChatGptLoginMut.isLoading}
            onClick={() => startChatGptLoginMut.mutate(undefined)}
          >
            <Show when={startChatGptLoginMut.isLoading} fallback={<ExternalLink size={14} />}>
              <Loader size={14} class="icon-spin" />
            </Show>
            Connect ChatGPT
          </button>
        }
      >
        <button
          type="button"
          class="btn btn-outline btn-sm"
          disabled={chatGptLogoutMut.isLoading}
          onClick={() => chatGptLogoutMut.mutate(undefined)}
        >
          <Show when={chatGptLogoutMut.isLoading} fallback={null}>
            <Loader size={14} class="icon-spin" />
          </Show>
          Logout
        </button>
      </Show>
    </div>
  );
}

function ProviderAuthRail(props: {
  readonly providerAuth: ProviderAuthStatus | undefined;
  readonly refetch: () => void;
}) {
  const [copilotLogin, setCopilotLogin] = createSignal<CopilotLoginState | null>(null);
  const [chatGptLogin, setChatGptLogin] = createSignal<ChatGptLoginState | null>(null);

  const startCopilotLoginMut = createMutation({
    fn: () => startCopilotLogin(),
    onSuccess: (result) => {
      setCopilotLogin({
        login_id: result.login_id,
        status: result.status,
        verification_uri: result.verification_uri ?? null,
        user_code: result.user_code ?? null,
        error: result.error ?? null,
      });
    },
    onError: (msg) => toast.error(msg),
  });

  const startChatGptLoginMut = createMutation({
    fn: () => startChatGptLogin(),
    onSuccess: (result) => {
      setChatGptLogin({
        login_id: result.login_id,
        status: result.status,
        auth_url: result.auth_url ?? null,
        error: result.error ?? null,
      });
      if (result.auth_url) window.open(result.auth_url, "_blank", "noopener,noreferrer");
    },
    onError: (msg) => toast.error(msg),
  });

  const chatGptLogoutMut = createMutation({
    fn: () => chatGptLogout(),
    onSuccess: () => {
      setChatGptLogin(null);
      toast.success("ChatGPT logged out");
      props.refetch();
    },
    onError: (msg) => toast.error(msg),
  });

  const unlisten = onGatewayEvent((event) => {
    if (event.type === "copilot_auth_started" || event.type === "copilot_auth_update") {
      setCopilotLogin({
        login_id: event.login.login_id,
        status: event.login.status,
        verification_uri: event.login.verification_uri ?? null,
        user_code: event.login.user_code ?? null,
        error: event.login.error ?? null,
      });
      if (event.type === "copilot_auth_update" && event.login.status === "complete") {
        toast.success("Copilot connected");
        props.refetch();
      }
      if (event.type === "copilot_auth_update" && event.login.status === "warning" && event.login.error) {
        props.refetch();
        toast.info(event.login.error);
      }
      if (event.type === "copilot_auth_update" && event.login.status === "error" && event.login.error) {
        props.refetch();
        toast.error(event.login.error);
      }
    }

    if (event.type === "chatgpt_auth_started" || event.type === "chatgpt_auth_update") {
      setChatGptLogin({
        login_id: event.login.login_id,
        status: event.login.status,
        auth_url: ("auth_url" in event.login ? event.login.auth_url : null) ?? null,
        error: event.login.error ?? null,
      });
      if (event.type === "chatgpt_auth_update" && event.login.status === "complete") {
        toast.success("ChatGPT connected");
        props.refetch();
      }
      if (event.type === "chatgpt_auth_update" && event.login.status === "warning" && event.login.error) {
        props.refetch();
        toast.info(event.login.error);
      }
      if (event.type === "chatgpt_auth_update" && event.login.status === "error" && event.login.error) {
        props.refetch();
        toast.error(event.login.error);
      }
    }
  });

  onCleanup(unlisten);

  const showCopilotDeviceCode = createMemo(() =>
    copilotLogin()?.status === "pending"
      && copilotLogin()?.verification_uri != null
      && copilotLogin()?.user_code != null
  );

  return (
    <div class="config-provider-rail">
      <div class="config-provider-rail-header">Provider access</div>
      <div class="config-provider-rail-body">
        <div class="config-provider-card">
          <div class="config-provider-card-header">
            <div class="config-provider-card-name">
              <Github size={14} />
              <span>Copilot</span>
            </div>
            <span class={`config-provider-badge ${props.providerAuth?.copilot.github_connected ? "config-provider-badge-connected" : "config-provider-badge-disconnected"}`}>
              {props.providerAuth?.copilot.github_connected ? "Connected" : "Not connected"}
            </span>
          </div>
          <div class="config-provider-card-body">
            <p>
              {props.providerAuth?.copilot.github_connected
                ? props.providerAuth?.copilot.session_cached
                  ? "GitHub token stored and Copilot session cached."
                  : "GitHub token stored. Copilot session will refresh when needed."
                : "Sign in with GitHub device flow to unlock Copilot-backed models."}
            </p>
            <Show when={showCopilotDeviceCode()}>
              <p>
                Open <a href={copilotLogin()?.verification_uri ?? undefined} target="_blank" rel="noreferrer">{copilotLogin()?.verification_uri}</a> and enter <code>{copilotLogin()?.user_code}</code>
              </p>
            </Show>
            <Show when={copilotLogin()?.status === "warning" && copilotLogin()?.error}>
              <p class="config-provider-card-error">{copilotLogin()?.error}</p>
            </Show>
            <Show when={copilotLogin()?.status === "error" && copilotLogin()?.error}>
              <p class="config-provider-card-error">{copilotLogin()?.error}</p>
            </Show>
          </div>
          <button
            type="button"
            class="btn btn-outline btn-sm"
            disabled={startCopilotLoginMut.isLoading || copilotLogin()?.status === "pending"}
            onClick={() => startCopilotLoginMut.mutate(undefined)}
          >
            <Show when={startCopilotLoginMut.isLoading || copilotLogin()?.status === "pending"}>
              <Loader size={14} class="icon-spin" />
            </Show>
            {props.providerAuth?.copilot.github_connected ? "Reconnect" : "Connect GitHub"}
          </button>
        </div>

        <div class="config-provider-card">
          <div class="config-provider-card-header">
            <div class="config-provider-card-name">
              <Bot size={14} />
              <span>Azure OpenAI</span>
            </div>
            <span class={`config-provider-badge ${props.providerAuth?.azure.connected ? "config-provider-badge-connected" : "config-provider-badge-disconnected"}`}>
              {props.providerAuth?.azure.connected ? "Connected" : "CLI needed"}
            </span>
          </div>
          <div class="config-provider-card-body">
            <p>
              {props.providerAuth?.azure.connected
                ? `Signed in as ${props.providerAuth.azure.user_name ?? "Azure user"}${props.providerAuth.azure.subscription_name ? ` on ${props.providerAuth.azure.subscription_name}` : ""}.`
                : props.providerAuth?.azure.command_hint ?? "Use Azure CLI login when a model uses Azure sign-in."}
            </p>
            <Show when={props.providerAuth?.azure.error}>
              <p class="config-provider-card-error">{props.providerAuth?.azure.error}</p>
            </Show>
          </div>
        </div>

        <div class="config-provider-card">
          <div class="config-provider-card-header">
            <div class="config-provider-card-name">
              <KeyRound size={14} />
              <span>OpenAI</span>
            </div>
            <span class={`config-provider-badge ${props.providerAuth?.openai.env_available ? "config-provider-badge-connected" : "config-provider-badge-disconnected"}`}>
              {props.providerAuth?.openai.env_available ? "Env ready" : "Needs key"}
            </span>
          </div>
          <div class="config-provider-card-body">
            <p>
              OpenAI uses API keys. Put <code>OPENAI_API_KEY</code> in your environment or store it in Pinchy secrets, then reference it from config.
            </p>
          </div>
        </div>

        <div class="config-provider-card">
          <div class="config-provider-card-header">
            <div class="config-provider-card-name">
              <Package size={14} />
              <span>ChatGPT</span>
            </div>
            <span class={`config-provider-badge ${props.providerAuth?.openai_chatgpt?.authenticated ? "config-provider-badge-connected" : "config-provider-badge-disconnected"}`}>
              {props.providerAuth?.openai_chatgpt?.authenticated
                ? props.providerAuth.openai_chatgpt.needs_refresh
                  ? "Needs refresh"
                  : "Connected"
                : "Not connected"}
            </span>
          </div>
          <div class="config-provider-card-body">
            <p>
              {props.providerAuth?.openai_chatgpt?.authenticated
                ? props.providerAuth.openai_chatgpt.needs_refresh
                  ? "Authenticated but token needs refresh. It will auto-refresh on next request."
                  : "Authenticated via ChatGPT OAuth. Uses your ChatGPT subscription at zero extra cost."
                : "Sign in with your ChatGPT account to use Codex-backed models via your subscription."}
            </p>
            <Show when={chatGptLogin()?.status === "pending" && chatGptLogin()?.auth_url}>
              <p>
                Waiting for browser sign-in... <a href={chatGptLogin()?.auth_url ?? undefined} target="_blank" rel="noreferrer">Open login page</a>
              </p>
            </Show>
            <Show when={chatGptLogin()?.status === "error" && chatGptLogin()?.error}>
              <p class="config-provider-card-error">{chatGptLogin()?.error}</p>
            </Show>
          </div>

          <Show
            when={props.providerAuth?.openai_chatgpt?.authenticated}
            fallback={
              <button
                type="button"
                class="btn btn-outline btn-sm"
                disabled={startChatGptLoginMut.isLoading || chatGptLogin()?.status === "pending"}
                onClick={() => startChatGptLoginMut.mutate(undefined)}
              >
                <Show when={startChatGptLoginMut.isLoading || chatGptLogin()?.status === "pending"}>
                  <Loader size={14} class="icon-spin" />
                </Show>
                Connect ChatGPT
              </button>
            }
          >
            <button
              type="button"
              class="btn btn-outline btn-sm"
              disabled={chatGptLogoutMut.isLoading}
              onClick={() => chatGptLogoutMut.mutate(undefined)}
            >
              <Show when={chatGptLogoutMut.isLoading}>
                <Loader size={14} class="icon-spin" />
              </Show>
              Logout
            </button>
          </Show>
        </div>
      </div>
    </div>
  );
}

function ModelCard(props: {
  readonly model: DraftRecord;
  readonly index: number;
  readonly providerAuth: ProviderAuthStatus | undefined;
  readonly onProviderAuthChanged: () => void;
  readonly onRemove: () => void;
  readonly onProviderChange: (value: string) => void;
  readonly onModelFieldChange: (field: string, value: string) => void;
  readonly onHeadersChange: (headers: Record<string, string>) => void;
  readonly onAddHeader: () => void;
}) {
  const provider = createMemo(() => getProviderKind(props.model["provider"]));
  const authMode = createMemo(() => getString(props.model["auth_mode"]).trim());
  const headers = createMemo(() => getStringRecord(props.model["headers"]));
  const modelId = createMemo(() => getString(props.model["id"]).trim());

  const discoveredModelsQ = createQuery({
    key: qk.discoveredModels(`config-${props.index}`),
    fn: () => {
      if (!supportsDynamicModelDiscovery(provider()) || modelId().length === 0) {
        return Effect.succeed<ModelsResponse>({ models: null });
      }
      return fetchDiscoveredModels(modelId());
    },
  });

  createEffect(() => {
    provider();
    modelId();
    discoveredModelsQ.refetch();
  });

  const discoveredModels = createMemo(() =>
    (discoveredModelsQ.data?.models ?? []).map((entry) => ({
      id: entry.id,
      label: entry.is_default ? `${entry.name} (default)` : entry.name,
    }))
  );

  const staticModels = createMemo(() => getStaticModelOptions(provider()));
  const modelOptions = createMemo(() =>
    discoveredModels().length > 0 ? discoveredModels() : [...staticModels()]
  );
  const canUseModelPicker = createMemo(() =>
    supportsDynamicModelDiscovery(provider()) || staticModels().length > 0
  );
  const discoveryError = createMemo(() =>
    discoveredModelsQ.error ? getConfigErrorMessage(new Error(discoveredModelsQ.error)) : null
  );
  const modelHint = createMemo(() => {
    if (supportsDynamicModelDiscovery(provider())) {
      return discoveryError()
        ?? (discoveredModels().length > 0 ? `Live list from ${getProviderLabel(provider())}` : undefined);
    }
    if (provider() === "openai-chatgpt") {
      return "Recommended Codex and ChatGPT-included models";
    }
    return undefined;
  });

  return (
    <div class="config-model-card">
      <div class="config-model-card-header">
        <div>
          <div class="config-model-card-title">
            {getString(props.model["id"]) || `Model ${props.index + 1}`}
          </div>
          <div class="config-model-card-subtitle">{getProviderLabel(props.model["provider"])}</div>
        </div>
        <button type="button" class="btn btn-ghost btn-sm" style={{ color: "var(--destructive)" }} onClick={props.onRemove}>
          <Trash2 size={14} />
          Remove
        </button>
      </div>

      <div class="config-model-grid">
        <FormField label="ID">
          <input
            class="input"
            value={getString(props.model["id"])}
            placeholder="copilot-default"
            onInput={(e) => props.onModelFieldChange("id", e.currentTarget.value)}
          />
        </FormField>

        <FormField label="Provider">
          <select class="select" value={provider()} onChange={(e) => props.onProviderChange(e.currentTarget.value)}>
            <For each={MODEL_PROVIDER_OPTIONS}>
              {(option) => <option value={option.value}>{option.label}</option>}
            </For>
          </select>
        </FormField>
      </div>

      <FormField
        label="Model"
        hint={modelHint()}
      >
        <Show
          when={canUseModelPicker()}
          fallback={
            <input
              class="input"
              value={getString(props.model["model"])}
              placeholder="gpt-4o"
              onInput={(e) => props.onModelFieldChange("model", e.currentTarget.value)}
            />
          }
        >
          <ModelDiscoverySelect
            options={modelOptions()}
            value={getString(props.model["model"])}
            onChange={(value) => props.onModelFieldChange("model", value)}
            isLoading={supportsDynamicModelDiscovery(provider()) && discoveredModelsQ.isLoading}
            error={supportsDynamicModelDiscovery(provider()) ? discoveryError() : null}
          />
        </Show>
      </FormField>

      <Show when={provider() === "azure-openai"}>
        <div class="config-model-grid">
          <FormField label="Endpoint">
            <input
              class="input"
              value={getString(props.model["endpoint"])}
              placeholder="https://...openai.azure.com"
              onInput={(e) => props.onModelFieldChange("endpoint", e.currentTarget.value)}
            />
          </FormField>
          <FormField label="API version">
            <input
              class="input"
              value={getString(props.model["api_version"])}
              placeholder="2024-10-21"
              onInput={(e) => props.onModelFieldChange("api_version", e.currentTarget.value)}
            />
          </FormField>

          <FormField
            label="Authentication"
            hint="Use API key or Azure CLI-backed Microsoft Entra ID"
          >
            <select
              class="select"
              value={authMode() === "entra_id" ? "entra_id" : "api_key"}
              onChange={(e) => props.onModelFieldChange("auth_mode", e.currentTarget.value === "api_key" ? "" : e.currentTarget.value)}
            >
              <option value="api_key">API key</option>
              <option value="entra_id">Azure sign-in</option>
            </select>
          </FormField>

          <Show when={authMode() === "entra_id"}>
            <div class="config-model-grid-full">
              <div class="config-azure-auth-panel">
                <Show
                  when={props.providerAuth?.azure.connected}
                  fallback={props.providerAuth?.azure.command_hint ?? "Requires Azure CLI login and Cognitive Services OpenAI User access."}
                >
                  Connected as {props.providerAuth?.azure.user_name ?? "Azure user"}
                  {props.providerAuth?.azure.subscription_name ? ` on ${props.providerAuth?.azure.subscription_name}` : ""}.
                </Show>
                <Show when={props.providerAuth?.azure.error}>
                  <div class="config-provider-card-error" style={{ "margin-top": "var(--space-2)" }}>
                    {props.providerAuth?.azure.error}
                  </div>
                </Show>
              </div>
            </div>
          </Show>

          <Show when={authMode() !== "entra_id"}>
            <div class="config-model-grid-full">
              <FormField label="API key">
                <ProviderAuthInput
                  value={getSecretInputValue(props.model["api_key"])}
                  onChange={(value) => props.onModelFieldChange("api_key", value)}
                  defaultEnvVar="AZURE_OPENAI_API_KEY"
                  inlinePlaceholder="sk-..."
                />
              </FormField>
            </div>
          </Show>

          <FormField label="Embedding deployment">
            <input
              class="input"
              value={getString(props.model["embedding_deployment"])}
              placeholder="embedding-prod"
              onInput={(e) => props.onModelFieldChange("embedding_deployment", e.currentTarget.value)}
            />
          </FormField>
          <FormField label="Embedding model">
            <input
              class="input"
              value={getString(props.model["embedding_model"])}
              placeholder="text-embedding-3-small"
              onInput={(e) => props.onModelFieldChange("embedding_model", e.currentTarget.value)}
            />
          </FormField>
        </div>
      </Show>

      <Show when={provider() === "openai"}>
        <div class="config-model-grid">
          <div class="config-model-grid-full">
            <FormField label="Authentication" hint="Uses config value first, then OPENAI_API_KEY from the environment">
              <ProviderAuthInput
                value={getSecretInputValue(props.model["api_key"])}
                onChange={(value) => props.onModelFieldChange("api_key", value)}
                defaultEnvVar="OPENAI_API_KEY"
                inlinePlaceholder="sk-..."
              />
            </FormField>
          </div>
          <FormField label="Embedding model">
            <input
              class="input"
              value={getString(props.model["embedding_model"])}
              placeholder="text-embedding-3-small"
              onInput={(e) => props.onModelFieldChange("embedding_model", e.currentTarget.value)}
            />
          </FormField>
        </div>
      </Show>

      <Show when={provider() === "openai-chatgpt"}>
        <ChatGptModelFields
          providerAuth={props.providerAuth}
          onStatusChanged={props.onProviderAuthChanged}
        />
      </Show>

      <Show when={provider() === "openai-compat"}>
        <div class="config-model-grid">
          <FormField label="Endpoint">
            <input
              class="input"
              value={getString(props.model["endpoint"])}
              placeholder="https://..."
              onInput={(e) => props.onModelFieldChange("endpoint", e.currentTarget.value)}
            />
          </FormField>
          <FormField label="Authentication" hint="Supports inline keys or provider-specific *_API_KEY env vars">
            <ProviderAuthInput
              value={getSecretInputValue(props.model["api_key"])}
              onChange={(value) => props.onModelFieldChange("api_key", value)}
              defaultEnvVar="OPENAI_COMPAT_API_KEY"
              inlinePlaceholder="Optional"
            />
          </FormField>
          <FormField label="Embedding model">
            <input
              class="input"
              value={getString(props.model["embedding_model"])}
              placeholder="text-embedding-3-small"
              onInput={(e) => props.onModelFieldChange("embedding_model", e.currentTarget.value)}
            />
          </FormField>
        </div>
      </Show>

      <FormField label="Headers">
        <div style={{ display: "flex", "flex-direction": "column", gap: "var(--space-3)" }}>
          <HeaderRows headers={headers()} onChange={props.onHeadersChange} />
          <button type="button" class="btn btn-ghost btn-sm" onClick={props.onAddHeader}>
            <Plus size={14} />
            Add header
          </button>
        </div>
      </FormField>
    </div>
  );
}

export default function Config() {
  const configQ = createQuery({
    key: qk.config,
    fn: fetchConfig,
  });

  const providerAuthQ = createQuery({
    key: qk.providerAuthStatus,
    fn: fetchProviderAuthStatus,
  });

  const saveMut = createMutation({
    fn: (config: Record<string, unknown>) => saveConfig(config),
    onSuccess: (_data, args) => {
      const next = cloneDraft(args);
      setServerDraft(next);
      setRawText(stringifyDraft(next));
      setRawError(null);
      setSaveError(null);
      invalidateQueries(qk.config);
      invalidateQueries(qk.status);
      invalidateQueries(qk.agents);
      toast.success("Config saved");
    },
    onError: (msg) => {
      setSaveError(msg);
      toast.error(msg);
    },
  });

  const [mode, setMode] = createSignal<Mode>("structured");
  const [serverDraft, setServerDraft] = createSignal<ConfigDraft | null>(null);
  const [draft, setDraft] = createSignal<ConfigDraft | null>(null);
  const [rawText, setRawText] = createSignal("");
  const [rawError, setRawError] = createSignal<string | null>(null);
  const [saveError, setSaveError] = createSignal<string | null>(null);

  let hydrated = false;

  const draftJson = createMemo(() => (draft() != null ? stringifyDraft(draft()!) : ""));
  const serverJson = createMemo(() => (serverDraft() != null ? stringifyDraft(serverDraft()!) : ""));
  const isDirty = createMemo(() =>
    draft() != null && serverDraft() != null && draftJson() !== serverJson()
  );
  const rawHasChanges = createMemo(() => mode() === "raw" && rawText() !== draftJson());

  createEffect(() => {
    const data = configQ.data;
    if (!data) return;
    if (!hydrated || !isDirty()) {
      const next = cloneDraft(data);
      hydrated = true;
      setServerDraft(next);
      setDraft(next);
      setRawText(stringifyDraft(next));
      setRawError(null);
      setSaveError(null);
    }
  });

  const validationIssues = createMemo(() => (draft() != null ? getConfigIssues(draft()!) : []));
  const issueMessage = createMemo(() => rawError() ?? saveError() ?? validationIssues()[0] ?? null);

  const agents = createMemo(() => getRecordArray(draft()?.["agents"]));
  const models = createMemo(() => getRecordArray(draft()?.["models"]));
  const channels = createMemo(() => getRecordValue(draft()?.["channels"]));
  const routing = createMemo(() => getRecordValue(draft()?.["routing"]));
  const skills = createMemo(() => getRecordValue(draft()?.["skills"]));
  const secrets = createMemo(() => getRecordValue(draft()?.["secrets"]));
  const defaultChannel = createMemo(() => getRecordValue(channels()["default_channel"]));
  const discord = createMemo(() => getRecordValue(channels()["discord"]));
  const agentIds = createMemo(() =>
    agents().map((agent) => getString(agent["id"])).filter((id) => id.length > 0)
  );
  const currentDefaultAgent = createMemo(() => getString(routing()["default_agent"]));
  const routingOptions = createMemo(() =>
    Array.from(new Set([...agentIds(), currentDefaultAgent()].filter((id) => id.length > 0)))
  );

  function updateDraft(mutator: (next: ConfigDraft) => void) {
    setDraft((prev) => {
      const next = cloneDraft(prev ?? {});
      mutator(next);
      return next;
    });
    setSaveError(null);
  }

  function setTopString(key: string, value: string) {
    updateDraft((next) => {
      setOptionalString(next, key, value);
    });
  }

  function setTopPresetNumber(key: string, value: string) {
    updateDraft((next) => {
      setOptionalNumber(next, key, value);
    });
  }

  function setRoutingDefaultAgent(value: string) {
    updateDraft((next) => {
      const routingDraft = getRecordValue(next["routing"]);
      if (value === "__none__") {
        delete routingDraft["default_agent"];
      } else {
        routingDraft["default_agent"] = value;
      }
      setOptionalRecord(next, "routing", routingDraft);
    });
  }

  function setDefaultChannelField(field: "kind" | "id", value: string) {
    updateDraft((next) => {
      const channelsDraft = getRecordValue(next["channels"]);
      const defaultChannelDraft = getRecordValue(channelsDraft["default_channel"]);
      if (field === "kind" && value === "__none__") {
        delete defaultChannelDraft["kind"];
      } else {
        setOptionalString(defaultChannelDraft, field, value);
      }
      setOptionalRecord(channelsDraft, "default_channel", defaultChannelDraft);
      next["channels"] = channelsDraft;
    });
  }

  function setDiscordToken(value: string) {
    updateDraft((next) => {
      const channelsDraft = getRecordValue(next["channels"]);
      const discordDraft = getRecordValue(channelsDraft["discord"]);
      setOptionalString(discordDraft, "token", value);
      setOptionalRecord(channelsDraft, "discord", discordDraft);
      next["channels"] = channelsDraft;
    });
  }

  function setSkillsEnabled(value: boolean) {
    updateDraft((next) => {
      const skillsDraft = getRecordValue(next["skills"]);
      setOptionalBoolean(skillsDraft, "enabled", value, true);
      setOptionalRecord(next, "skills", skillsDraft);
    });
  }

  function setSkillsList(field: string, value: string) {
    updateDraft((next) => {
      const skillsDraft = getRecordValue(next["skills"]);
      setOptionalStringList(skillsDraft, field, value);
      setOptionalRecord(next, "skills", skillsDraft);
    });
  }

  function setSecretsField(field: string, value: string) {
    updateDraft((next) => {
      const secretsDraft = getRecordValue(next["secrets"]);
      setOptionalString(secretsDraft, field, value);
      setOptionalRecord(next, "secrets", secretsDraft);
    });
  }

  function updateModel(index: number, mutator: (model: DraftRecord) => void) {
    updateDraft((next) => {
      const nextModels = getRecordArray(next["models"]).map((model) => ({ ...model }));
      const model = { ...(nextModels[index] ?? {}) };
      mutator(model);
      nextModels[index] = model;
      next["models"] = nextModels;
    });
  }

  function removeModel(index: number) {
    updateDraft((next) => {
      next["models"] = getRecordArray(next["models"]).filter((_, modelIndex) => modelIndex !== index);
    });
  }

  function addModel() {
    updateDraft((next) => {
      const nextModels = getRecordArray(next["models"]).map((model) => ({ ...model }));
      nextModels.push({ id: nextModelId(nextModels), provider: "copilot" });
      next["models"] = nextModels;
    });
  }

  function setModelProvider(index: number, value: string) {
    updateModel(index, (nextModel) => {
      normalizeModelForProvider(nextModel, getProviderKind(value));
    });
  }

  function setModelField(index: number, field: string, value: string) {
    updateModel(index, (nextModel) => {
      setOptionalModelField(nextModel, field, value);
    });
  }

  function setModelHeaders(index: number, headersValue: Record<string, string>) {
    updateModel(index, (nextModel) => {
      setOptionalRecord(nextModel, "headers", headersValue);
    });
  }

  function addModelHeader(index: number) {
    updateModel(index, (nextModel) => {
      const headersValue = getStringRecord(nextModel["headers"]);
      headersValue[nextHeaderKey(headersValue)] = "";
      nextModel["headers"] = headersValue;
    });
  }

  function handleModeChange(nextMode: Mode) {
    if (nextMode === mode()) return;
    if (mode() === "raw" && rawError() != null && draft() != null) {
      setRawText(stringifyDraft(draft()!));
      setRawError(null);
    }
    if (nextMode === "raw" && draft() != null) {
      setRawText(stringifyDraft(draft()!));
      setRawError(null);
    }
    setMode(nextMode);
  }

  function handleRawChange(value: string) {
    setRawText(value);
    setSaveError(null);
    try {
      const parsed = JSON.parse(value) as unknown;
      if (!isRecord(parsed)) {
        setRawError("Config must be a JSON object.");
        return;
      }
      setDraft(parsed);
      setRawError(null);
    } catch (error) {
      setRawError(error instanceof Error ? error.message : "Invalid JSON.");
    }
  }

  function handleFormatRaw() {
    if (draft() == null || rawError() != null) return;
    setRawText(stringifyDraft(draft()!));
  }

  function handleDiscard() {
    if (serverDraft() == null) return;
    const next = cloneDraft(serverDraft()!);
    setDraft(next);
    setRawText(stringifyDraft(next));
    setRawError(null);
    setSaveError(null);
  }

  function handleSave() {
    if (draft() == null || rawError() != null || validationIssues().length > 0) return;
    saveMut.mutate(draft()!);
  }

  const statusLabel = createMemo(() => {
    if (rawError() != null) return "Invalid JSON";
    if (isDirty() || rawHasChanges()) return "Unsaved";
    return "Saved";
  });

  const statusClass = createMemo(() => {
    if (rawError() != null) return "config-status-invalid";
    if (isDirty() || rawHasChanges()) return "config-status-unsaved";
    return "config-status-saved";
  });

  return (
    <PageShell
      maxWidth="5xl"
      header={
        <PageTitle icon={<Settings size={14} />} title="Config">
          <span class={`config-status ${statusClass()}`}>{statusLabel()}</span>

          <div class="separator-vertical" style={{ height: "20px" }} />

          <button
            class={`btn btn-sm ${mode() === "structured" ? "btn-secondary" : "btn-ghost"}`}
            onClick={() => handleModeChange("structured")}
          >
            <Settings size={14} />
            Structured
          </button>
          <button
            class={`btn btn-sm ${mode() === "raw" ? "btn-secondary" : "btn-ghost"}`}
            onClick={() => handleModeChange("raw")}
          >
            <Code size={14} />
            Raw
          </button>

          <Show when={mode() === "raw"}>
            <button class="btn btn-ghost btn-sm" disabled={rawError() != null} onClick={handleFormatRaw}>
              Format
            </button>
          </Show>

          <button
            class="btn btn-ghost btn-sm"
            onClick={handleDiscard}
            disabled={(!(isDirty() || rawHasChanges()) && !(mode() === "raw" && rawError() != null)) || saveMut.isLoading}
          >
            <RefreshCw size={14} />
            Discard
          </button>

          <button
            class="btn btn-primary btn-sm"
            disabled={draft() == null || !isDirty() || rawError() != null || validationIssues().length > 0 || saveMut.isLoading}
            onClick={handleSave}
          >
            <Save size={14} />
            {saveMut.isLoading ? "Saving..." : "Save"}
          </button>
        </PageTitle>
      }
    >
      <div class="route-enter" style={{ display: "flex", "flex-direction": "column", gap: "var(--space-4)" }}>
        <Show when={issueMessage()}>
          <InlineAlert message={issueMessage()!} />
        </Show>

        <Show
          when={!configQ.isLoading || draft() != null}
          fallback={
            <div style={{ display: "flex", "flex-direction": "column", gap: "var(--space-4)" }}>
              <div class="skeleton" style={{ height: "112px", "border-radius": "var(--radius-lg)" }} />
              <div class="skeleton" style={{ height: "208px", "border-radius": "var(--radius-lg)" }} />
              <div class="skeleton" style={{ height: "256px", "border-radius": "var(--radius-lg)" }} />
            </div>
          }
        >
          <Show when={configQ.error != null && draft() == null}>
            <div class="empty-state">
              <Settings size={24} />
              <p>Couldn't load config</p>
              <button class="btn btn-secondary btn-sm" onClick={() => configQ.refetch()}>Retry</button>
            </div>
          </Show>

          <Show when={draft() != null && mode() === "structured"}>
            <div style={{ display: "flex", "flex-direction": "column", gap: "var(--space-4)" }}>
              <div class="config-summary-badges">
                <SummaryBadge text={`${agents().length} agents`} />
                <SummaryBadge text={`${models().length} models`} />
                <SummaryBadge text={currentDefaultAgent() || "No default"} />
              </div>

              <ProviderAuthRail providerAuth={providerAuthQ.data} refetch={providerAuthQ.refetch} />

              <div class="config-grid-2">
                <SectionCard title="Runtime">
                  <div class="config-model-grid">
                    <FormField label="Timezone">
                      <input
                        class="input"
                        value={getString(draft()?.["timezone"])}
                        placeholder="UTC"
                        onInput={(e) => setTopString("timezone", e.currentTarget.value)}
                      />
                    </FormField>
                    <FormField label="Chromium path">
                      <input
                        class="input"
                        value={getString(draft()?.["chromium_path"])}
                        placeholder="/path/to/chromium"
                        onInput={(e) => setTopString("chromium_path", e.currentTarget.value)}
                      />
                    </FormField>
                    <PresetNumberField
                      label="Session expiry"
                      value={getNumberText(draft()?.["session_expiry_days"])}
                      onChange={(value) => setTopPresetNumber("session_expiry_days", value)}
                      options={SESSION_EXPIRY_PRESETS}
                      placeholder="30"
                    />
                    <PresetNumberField
                      label="Cron expiry"
                      value={getNumberText(draft()?.["cron_session_expiry_days"])}
                      onChange={(value) => setTopPresetNumber("cron_session_expiry_days", value)}
                      options={CRON_EXPIRY_PRESETS}
                      placeholder="7"
                    />
                    <PresetNumberField
                      label="Cron events keep"
                      value={getNumberText(draft()?.["cron_events_max_keep"])}
                      onChange={(value) => setTopPresetNumber("cron_events_max_keep", value)}
                      options={CRON_EVENTS_PRESETS}
                      placeholder="50"
                    />
                  </div>
                </SectionCard>

                <SectionCard title="Routing">
                  <div class="config-model-grid">
                    <FormField label="Default agent">
                      <Show
                        when={routingOptions().length > 0}
                        fallback={
                          <input
                            class="input"
                            value={currentDefaultAgent()}
                            placeholder="default"
                            onInput={(e) => setRoutingDefaultAgent(e.currentTarget.value)}
                          />
                        }
                      >
                        <select class="select" value={currentDefaultAgent() || "__none__"} onChange={(e) => setRoutingDefaultAgent(e.currentTarget.value)}>
                          <option value="__none__">None</option>
                          <For each={routingOptions()}>
                            {(id) => <option value={id}>{id}</option>}
                          </For>
                        </select>
                      </Show>
                    </FormField>

                    <FormField label="Agents">
                      <div class="input" style={{ display: "flex", "align-items": "center" }}>
                        {agents().length}
                      </div>
                    </FormField>
                  </div>
                </SectionCard>
              </div>

              <SectionCard
                title="Models"
                action={
                  <button type="button" class="btn btn-secondary btn-sm" onClick={addModel}>
                    <Plus size={14} />
                    Add
                  </button>
                }
              >
                <Show
                  when={models().length > 0}
                  fallback={
                    <div class="config-empty">
                      <Package size={20} />
                      <p>No models</p>
                      <button type="button" class="btn btn-primary btn-sm" onClick={addModel}>Add</button>
                    </div>
                  }
                >
                  <div style={{ display: "flex", "flex-direction": "column", gap: "var(--space-3)" }}>
                    <For each={models()}>
                      {(model, index) => (
                        <ModelCard
                          model={model}
                          index={index()}
                          providerAuth={providerAuthQ.data}
                          onProviderAuthChanged={providerAuthQ.refetch}
                          onRemove={() => removeModel(index())}
                          onProviderChange={(value) => setModelProvider(index(), value)}
                          onModelFieldChange={(field, value) => setModelField(index(), field, value)}
                          onHeadersChange={(headersValue) => setModelHeaders(index(), headersValue)}
                          onAddHeader={() => addModelHeader(index())}
                        />
                      )}
                    </For>
                  </div>
                </Show>
              </SectionCard>

              <div class="config-grid-2">
                <SectionCard title="Channels">
                  <div class="config-model-grid">
                    <FormField label="Default kind">
                      <select class="select" value={getString(defaultChannel()["kind"]) || "__none__"} onChange={(e) => setDefaultChannelField("kind", e.currentTarget.value)}>
                        <option value="__none__">None</option>
                        <option value="channel">Channel</option>
                        <option value="user">User</option>
                        <option value="group">Group</option>
                      </select>
                    </FormField>

                    <FormField label="Default target">
                      <input
                        class="input"
                        value={getString(defaultChannel()["id"])}
                        placeholder="1234567890"
                        onInput={(e) => setDefaultChannelField("id", e.currentTarget.value)}
                      />
                    </FormField>

                    <div class="config-model-grid-full">
                      <FormField label="Discord token">
                        <SecretInput
                          value={getSecretInputValue(discord()["token"])}
                          onChange={setDiscordToken}
                          placeholder="$DISCORD_TOKEN"
                        />
                      </FormField>
                    </div>
                  </div>
                </SectionCard>

                <SectionCard title="Skills">
                  <FormField label="Enabled" inline>
                    <input
                      type="checkbox"
                      checked={getBoolean(skills()["enabled"], true)}
                      onChange={(e) => setSkillsEnabled(e.currentTarget.checked)}
                    />
                  </FormField>

                  <div class="config-model-grid">
                    <FormField label="Allow">
                      <textarea
                        class="textarea"
                        style={{ "min-height": "96px" }}
                        value={joinLines(skills()["allow"])}
                        placeholder="skill-id"
                        onInput={(e) => setSkillsList("allow", e.currentTarget.value)}
                      />
                    </FormField>
                    <FormField label="Deny">
                      <textarea
                        class="textarea"
                        style={{ "min-height": "96px" }}
                        value={joinLines(skills()["deny"])}
                        placeholder="skill-id"
                        onInput={(e) => setSkillsList("deny", e.currentTarget.value)}
                      />
                    </FormField>
                  </div>

                  <FormField label="Managed allow">
                    <textarea
                      class="textarea"
                      style={{ "min-height": "96px" }}
                      value={joinLines(skills()["operator_allowed"])}
                      placeholder="skill-id"
                      onInput={(e) => setSkillsList("operator_allowed", e.currentTarget.value)}
                    />
                  </FormField>
                </SectionCard>
              </div>

              <div class="config-grid-2-uneven">
                <SectionCard title="Secrets">
                  <div style={{ display: "grid", gap: "var(--space-4)" }}>
                    <FormField label="Path">
                      <input
                        class="input"
                        value={getString(secrets()["path"])}
                        placeholder="~/.pinchy/secrets"
                        onInput={(e) => setSecretsField("path", e.currentTarget.value)}
                      />
                    </FormField>
                    <FormField label="Keyring service">
                      <input
                        class="input"
                        value={getString(secrets()["keyring_service"])}
                        placeholder="pinchy"
                        onInput={(e) => setSecretsField("keyring_service", e.currentTarget.value)}
                      />
                    </FormField>
                  </div>
                </SectionCard>

                <SectionCard
                  title="Agents"
                  action={
                    <A href="/agents" class="btn btn-secondary btn-sm" style={{ "text-decoration": "none" }}>
                      Open
                    </A>
                  }
                >
                  <Show
                    when={agents().length > 0}
                    fallback={
                      <div class="config-empty">
                        <Bot size={20} />
                        <p>No agents</p>
                        <A href="/agents" class="btn btn-primary btn-sm" style={{ "text-decoration": "none" }}>
                          Open
                        </A>
                      </div>
                    }
                  >
                    <div class="config-agent-grid">
                      <For each={agents()}>
                        {(agent) => {
                          const id = getString(agent["id"]);
                          return (
                            <A href={`/agents/${id}`} class="config-agent-link">
                              <div class="config-agent-link-header">
                                <span class="config-agent-link-id">{id}</span>
                                <span class="config-agent-link-model">{getString(agent["model"]) || "default"}</span>
                              </div>
                              <div class="config-agent-link-meta">
                                <Show when={getString(agent["root"]).length > 0}>
                                  <span>{getString(agent["root"])}</span>
                                </Show>
                                <Show when={getNumberText(agent["heartbeat_secs"]).length > 0}>
                                  <span>{getNumberText(agent["heartbeat_secs"])}s</span>
                                </Show>
                              </div>
                            </A>
                          );
                        }}
                      </For>
                    </div>
                  </Show>
                </SectionCard>
              </div>
            </div>
          </Show>

          <Show when={draft() != null && mode() === "raw"}>
            <SectionCard title="Raw JSON">
              <textarea
                class={`config-textarea ${rawError() ? "config-textarea-invalid" : ""}`}
                value={rawText()}
                spellcheck={false}
                onInput={(e) => handleRawChange(e.currentTarget.value)}
              />
            </SectionCard>
          </Show>
        </Show>
      </div>
    </PageShell>
  );
}
