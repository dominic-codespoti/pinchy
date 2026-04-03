'use client';

import { useState, useCallback, useEffect } from 'react';
import type { McpServers, McpServerConfig } from '../../../types';

export function useMcpServers(
  initialServers: McpServers | undefined,
  onUpdate: (servers: McpServers) => void
) {
  const [servers, setServersState] = useState<McpServers>({});

  // Sync with external config
  useEffect(() => {
    if (initialServers) {
      setServersState(initialServers);
    }
  }, [initialServers]);

  const addOrUpdateServer = useCallback((
    name: string,
    config: McpServerConfig,
    editingName: string | null
  ) => {
    setServersState((prev: McpServers) => {
      const updated = { ...prev };

      // If renaming, delete the old entry
      if (editingName && editingName !== name) {
        delete updated[editingName];
      }

      updated[name] = config;

      // Notify parent
      onUpdate(updated);

      return updated;
    });
  }, [onUpdate]);

  const deleteServer = useCallback((name: string) => {
    setServersState((prev: McpServers) => {
      const updated = { ...prev };
      delete updated[name];

      // Notify parent
      onUpdate(updated);

      return updated;
    });
  }, [onUpdate]);

  const setServers = useCallback((newServers: McpServers) => {
    setServersState(newServers);
  }, []);

  const serverEntries = Object.entries(servers);

  return {
    servers,
    serverEntries,
    addOrUpdateServer,
    deleteServer,
    setServers,
  };
}
