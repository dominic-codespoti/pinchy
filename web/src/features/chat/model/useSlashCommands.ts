import { useEffect, useMemo, useState } from "react";
import type { SlashCommand } from "@/shared/api/client";

export function useSlashCommands(draft: string, slashData?: SlashCommand[] | undefined) {
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashIdx, setSlashIdx] = useState(0);

  const filteredSlash = useMemo(() => {
    if (!slashOpen || !slashData) return [] as SlashCommand[];
    const prefix = draft.startsWith("/") ? draft.slice(1).split(/\s/)[0].toLowerCase() : "";
    return slashData.filter((cmd) => cmd.name.toLowerCase().startsWith(prefix));
  }, [slashOpen, slashData, draft]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (draft.startsWith("/") && !draft.includes("\n")) {
      const afterSlash = draft.slice(1);
      const hasSpace = afterSlash.includes(" ");
      const firstWord = afterSlash.split(/\s/)[0];
      const exactMatch = slashData?.some((c) => c.name === firstWord);
      if (exactMatch && (hasSpace || afterSlash === firstWord)) {
        setSlashOpen(false);
      } else {
        setSlashOpen(true);
        setSlashIdx(0);
      }
    } else {
      setSlashOpen(false);
    }
  }, [draft, slashData]);
  /* eslint-enable react-hooks/set-state-in-effect */

  return { slashOpen, setSlashOpen, slashIdx, setSlashIdx, filteredSlash } as const;
}
