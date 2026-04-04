'use client';

import { Save, X, Plus } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { McpServerDialogProps } from './mcp-types';

export function McpServerDialog({
  open,
  onOpenChange,
  editingName,
  formData,
  onFormChange,
  onSave,
  isSaving,
}: McpServerDialogProps) {
  const updateField = <K extends keyof typeof formData>(
    field: K,
    value: (typeof formData)[K]
  ) => {
    onFormChange({ ...formData, [field]: value });
  };

  const isFormValid = Boolean(
    formData.name.trim() &&
      (formData.transport === 'stdio'
        ? formData.command.trim()
        : formData.url.trim())
  );

  const addEnvRow = () => {
    onFormChange({
      ...formData,
      env: [...formData.env, { key: '', value: '' }],
    });
  };

  const removeEnvRow = (index: number) => {
    onFormChange({
      ...formData,
      env: formData.env.filter((_, i) => i !== index),
    });
  };

  const updateEnvRow = (index: number, field: 'key' | 'value', value: string) => {
    onFormChange({
      ...formData,
      env: formData.env.map((row, i) => (i === index ? { ...row, [field]: value } : row)),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
              onChange={(e) => updateField('name', e.target.value)}
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
              onValueChange={(value: import('../../types').McpTransport) =>
                updateField('transport', value)
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
                  onChange={(e) => updateField('command', e.target.value)}
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
                  onChange={(e) => updateField('args', e.target.value)}
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
                onChange={(e) => updateField('url', e.target.value)}
                placeholder="https://your-mcp-server.com/sse or https://your-mcp-server.com/mcp"
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
                updateField('timeout', parseInt(e.target.value, 10) || 30)
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
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={onSave} disabled={!isFormValid || isSaving}>
            <Save className="mr-2 h-4 w-4" />
            {isSaving ? 'Saving...' : editingName ? 'Save Changes' : 'Add Server'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
