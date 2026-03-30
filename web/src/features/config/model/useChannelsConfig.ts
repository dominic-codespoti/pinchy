import { useMemo, useCallback } from "react";
import { asRecord } from "./useConfigForm";

export function useChannelsConfig(
  values: Record<string, unknown>,
  setValues: React.Dispatch<React.SetStateAction<Record<string, unknown>>>,
) {
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

  const secretToString = useCallback((value: unknown): string => {
    if (typeof value === "string") return value;
    const record = asRecord(value);
    const key = record.key;
    const source = record.source;
    if (typeof key === "string" && typeof source === "string") return `${source}:${key}`;
    return "";
  }, []);

  const updateChannel = useCallback((key: string, value: unknown) => {
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
  }, [setValues]);

  return {
    channels,
    discord,
    defaultChannel,
    secretToString,
    actions: {
      updateChannel,
    },
  };
}
