'use client';

import { useState, useEffect } from 'react';
import { Plug, Plus, Pencil, Trash2, Save, X, Terminal, Globe, Variable } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { useConfig, useUpdateConfig } from '../../hooks';
import { McpServerConfig, McpServers, McpTransport } from '../../types';

interface McpFormData {
  name: string;
  transport: McpTransport;
  command: string;
  args: string;
  url: string;
  env: Array<{ key: string; value: string }>;
  timeout: number;
}

const emptyFormData: McpFormData = {
  name: '',
  transport: 'stdio',
  command: '',
  args: '',
  url: '',
  env: [],
  timeout: 30,
};

function transportBadgeColor(transport?: McpTransport): string {
  switch (transport) {
    case 'stdio':
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
    case 'sse':
      return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
    case 'streamablehttp':
      return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200';
    default:
      return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200';
  }
}

function transportLabel(transport?: McpTransport): string {
  switch (transport) {
    case 'stdio':
      return 'stdio';
    case 'sse':
      return 'SSE';
    case 'streamablehttp':
      return 'HTTP';
    default:
      return 'stdio';
  }
}

export function McpPage() {
  const { data: config, isLoading } = useConfig();
  const updateConfig = useUpdateConfig();

  const [servers, setServers] = useState<McpServers>({});
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingName, setEditingName] = useState<string | null>(null);
  const [formData, setFormData] = useState<McpFormData>(emptyFormData);
  const [deleteConfirmName, setDeleteConfirmName] = useState<string | null>(null);

  // Sync servers from config
  useEffect(() => {
    if (config?.mcp_servers) {
      setServers((config.mcp_servers as McpServers) ?? {});
    }
  }, [config]);

  const handleAddNew = () => {
    setEditingName(null);
    setFormData(emptyFormData);
    setDialogOpen(true);
  };

  const handleEdit = (name: string, server: McpServerConfig) => {
    setEditingName(name);
    setFormData({
      name,
      transport: server.transport ?? 'stdio',
      command: server.command ?? '',
      args: (server.args ?? []).join(' '),
      url: server.url ?? '',
      env: Object.entries(server.env ?? {}).map(([key, value]) => ({ key, value })),
      timeout: server.timeout ?? 30,
    });
    setDialogOpen(true);
  };

  const handleDelete = (name: string) => {
    const updatedServers = { ...servers };
    delete updatedServers[name];
    setServers(updatedServers);

    updateConfig.mutate({ mcp_servers: updatedServers });
    setDeleteConfirmName(null);
  };

  const handleSave = () => {
    const envMap: Record<string, string> = {};
    for (const { key, value } of formData.env) {
      if (key.trim()) {
        envMap[key.trim()] = value;
      }
    }

    const serverConfig: McpServerConfig = {
      transport: formData.transport,
      timeout: formData.timeout,
    };

    if (formData.transport === 'stdio') {
      if (formData.command.trim()) {
        serverConfig.command = formData.command.trim();
      }
      if (formData.args.trim()) {
        serverConfig.args = formData.args
          .split(/\s+/)
          .map((s) => s.trim())
          .filter((s) => s.length > 0);
      }
    } else {
      if (formData.url.trim()) {
        serverConfig.url = formData.url.trim();
      }
    }

    if (Object.keys(envMap).length > 0) {
      serverConfig.env = envMap;
    }

    const updatedServers = { ...servers };

    // If renaming, delete the old entry
    if (editingName && editingName !== formData.name) {
      delete updatedServers[editingName];
    }

    updatedServers[formData.name.trim()] = serverConfig;

    setServers(updatedServers);
    updateConfig.mutate({ mcp_servers: updatedServers });
    setDialogOpen(false);
  };

  const addEnvRow = () => {
    setFormData((prev) => ({
      ...prev,
      env: [...prev.env, { key: '', value: '' }],
    }));
  };

  const removeEnvRow = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      env: prev.env.filter((_, i) => i !== index),
    }));
  };

  const updateEnvRow = (index: number, field: 'key' | 'value', value: string) => {
    setFormData((prev) => ({
      ...prev,
      env: prev.env.map((row, i) => (i === index ? { ...row, [field]: value } : row)),
    }));
  };

  const isFormValid = formData.name.trim() && 
    (formData.transport === 'stdio' ? formData.command.trim() : formData.url.trim());

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-4 w-48" />
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  const serverEntries = Object.entries(servers);

  return (
    <div className="space-y-6">
      {/* Header Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Plug className="h-5 w-5" />
              <CardTitle>MCP Servers</CardTitle>
            </div>
            <Button onClick={handleAddNew} size="sm">
              <Plus className="mr-2 h-4 w-4" />
              Add Server
            </Button>
          </div>
          <CardDescription>
            Manage Model Context Protocol (MCP) server connections
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Servers List */}
      {serverEntries.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Plug className="h-12 w-12 text-muted-foreground/50" />
            <p className="mt-4 text-lg font-medium">No MCP servers configured</p>
            <p className="text-sm text-muted-foreground">
              Add an MCP server to extend Pinchy with external tools
            </p>
            <Button onClick={handleAddNew} className="mt-6" variant="outline">
              <Plus className="mr-2 h-4 w-4" />
              Add Your First Server
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {serverEntries.map(([name, server]) => (
            <Card key={name}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-lg">{name}</CardTitle>
                      <Badge
                        variant="secondary"
                        className={transportBadgeColor(server.transport)}
                      >
                        {transportLabel(server.transport)}
                      </Badge>
                    </div>
                    <CardDescription className="font-mono text-xs">
                      {server.transport === 'stdio' ? (
                        <span className="flex items-center gap-1">
                          <Terminal className="h-3 w-3" />
                          {server.command ?? 'No command'}
                          {server.args && server.args.length > 0 && (
                            <span className="text-muted-foreground">
                              {' '}
                              {server.args.join(' ')}
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="flex items-center gap-1">
                          <Globe className="h-3 w-3" />
                          {server.url ?? 'No URL'}
                        </span>
                      )}
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleEdit(name, server)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setDeleteConfirmName(name)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              {server.env && Object.keys(server.env).length > 0 && (
                <CardContent className="pt-0">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Variable className="h-3 w-3" />
                    <span>{Object.keys(server.env).length} environment variable(s)</span>
                  </div>
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingName ? 'Edit MCP Server' : 'Add MCP Server'}</DialogTitle>
            <DialogDescription>
              Configure a Model Context Protocol server connection
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Server Name */}
            <div className="space-y-2">
              <Label htmlFor="server-name">
                Server Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="server-name"
                value={formData.name}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, name: e.target.value }))
                }
                placeholder="e.g., brave-search, filesystem, github"
                disabled={!!editingName}
              />
              <p className="text-xs text-muted-foreground">
                Unique identifier for this server (cannot be changed after creation)
              </p>
            </div>

            <Separator />

            {/* Transport Type */}
            <div className="space-y-2">
              <Label htmlFor="transport">Transport Type</Label>
              <Select
                value={formData.transport}
                onValueChange={(value: McpTransport) =>
                  setFormData((prev) => ({ ...prev, transport: value }))
                }
              >
                <SelectTrigger id="transport">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="stdio">stdio (command-based)</SelectItem>
                  <SelectItem value="sse">SSE (Server-Sent Events)</SelectItem>
                  <SelectItem value="streamablehttp">HTTP Streamable</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Communication protocol for the MCP server
              </p>
            </div>

            <Separator />

            {/* Transport-specific fields */}
            {formData.transport === 'stdio' ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="command">
                    Command <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="command"
                    value={formData.command}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, command: e.target.value }))
                    }
                    placeholder="e.g., npx, python, /usr/local/bin/mcp-server"
                  />
                  <p className="text-xs text-muted-foreground">
                    The executable command to run the MCP server
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="args">Arguments</Label>
                  <Input
                    id="args"
                    value={formData.args}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, args: e.target.value }))
                    }
                    placeholder="e.g., -y @anthropic/mcp-server-brave --api-key $BRAVE_API_KEY"
                  />
                  <p className="text-xs text-muted-foreground">
                    Space-separated arguments to pass to the command
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="url">
                  Server URL <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="url"
                  value={formData.url}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, url: e.target.value }))
                  }
                  placeholder="e.g., http://localhost:3000/sse or http://localhost:3000/mcp"
                />
                <p className="text-xs text-muted-foreground">
                  The URL endpoint for the MCP server
                </p>
              </div>
            )}

            <Separator />

            {/* Environment Variables */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Environment Variables</Label>
                <Button variant="outline" size="sm" onClick={addEnvRow}>
                  <Plus className="mr-2 h-3 w-3" />
                  Add Variable
                </Button>
              </div>

              {formData.env.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No environment variables configured
                </p>
              ) : (
                <div className="space-y-2">
                  {formData.env.map((row, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <Input
                        placeholder="KEY"
                        value={row.key}
                        onChange={(e) => updateEnvRow(index, 'key', e.target.value)}
                        className="flex-1"
                      />
                      <span className="text-muted-foreground">=</span>
                      <Input
                        placeholder="value"
                        value={row.value}
                        onChange={(e) => updateEnvRow(index, 'value', e.target.value)}
                        className="flex-1"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeEnvRow(index)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <Separator />

            {/* Timeout */}
            <div className="space-y-2">
              <Label htmlFor="timeout">Timeout (seconds)</Label>
              <Input
                id="timeout"
                type="number"
                value={formData.timeout}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    timeout: parseInt(e.target.value, 10) || 30,
                  }))
                }
                min={1}
                max={300}
              />
              <p className="text-xs text-muted-foreground">
                Connection timeout in seconds (default: 30)
              </p>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={!isFormValid || updateConfig.isPending}>
              <Save className="mr-2 h-4 w-4" />
              {updateConfig.isPending ? 'Saving...' : editingName ? 'Save Changes' : 'Add Server'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteConfirmName} onOpenChange={() => setDeleteConfirmName(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete MCP Server</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete the MCP server &quot;{deleteConfirmName}&quot;? This
              action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDeleteConfirmName(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteConfirmName && handleDelete(deleteConfirmName)}
              disabled={updateConfig.isPending}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
