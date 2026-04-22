'use client';

import { useState, useEffect } from 'react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Loader2, Pencil, Save, Bot } from 'lucide-react';
import { Agent } from '../types';
import { useAgentModels, useAvailableModels } from '@/features/settings';
import { AgentModelPicker } from './agent-model-picker';
import { getReasoningControlSpec, normalizeAgentModelSelection } from '../model-options';

interface EditAgentSheetProps {
  agent: Agent;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onSave?: (agentId: string, data: Partial<Agent>) => Promise<void>;
  trigger?: React.ReactNode;
}

export function EditAgentSheet({ agent, open: controlledOpen, onOpenChange, onSave, trigger }: EditAgentSheetProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = (value: boolean) => {
    setInternalOpen(value);
    onOpenChange?.(value);
  };
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [formData, setFormData] = useState({
    model: agent.config.model || '',
    provider: agent.config.provider,
    heartbeatInterval: agent.heartbeatInterval || 60,
    reasoningEffort: agent.reasoningEffort || 'medium',
  });

  const { data: models, isLoading: modelsLoading } = useAgentModels();
  const { data: availableModels } = useAvailableModels();

  const modelOptions = models || [];
  const selection = normalizeAgentModelSelection(formData.provider, formData.model, modelOptions);
  const reasoningSpec = getReasoningControlSpec(selection.provider, selection.model, selection.option, availableModels);
  // Reset form when agent changes or sheet opens
  useEffect(() => {
    if (open) {
      const selection = normalizeAgentModelSelection(
        agent.config.provider,
        agent.config.model,
        modelOptions
      );
      setFormData({
        model: selection.model,
        provider: selection.provider,
        heartbeatInterval: agent.heartbeatInterval || 60,
        reasoningEffort: agent.reasoningEffort || reasoningSpec.defaultValue,
      });
      setHasChanges(false);
    }
  }, [agent.config.model, agent.config.provider, agent.heartbeatInterval, agent.reasoningEffort, open, modelOptions, reasoningSpec.defaultValue]);

  const handleChange = (field: string, value: string | number) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setHasChanges(true);
  };

  const handleSave = async () => {
    if (!hasChanges) return;

    setIsSaving(true);
    try {
      const saveSelection = normalizeAgentModelSelection(
        formData.provider,
        formData.model,
        modelOptions,
        'save'
      );
      await onSave?.(agent.id, {
        config: {
          ...agent.config,
          model: saveSelection.model,
          provider: saveSelection.provider,
        },
        heartbeatEnabled: agent.heartbeatEnabled,
        heartbeatInterval: formData.heartbeatInterval,
        reasoningEffort: formData.reasoningEffort,
      });
      setOpen(false);
    } catch (error) {
      console.error('Failed to save agent:', error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm">
            <Pencil className="mr-2 h-4 w-4" />
            Edit
          </Button>
        )}
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Bot className="h-5 w-5 text-primary" />
            </div>
            <div>
              <SheetTitle>Edit Agent</SheetTitle>
              <SheetDescription>{agent.name}</SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <div className="py-6 space-y-6">
          <div className="rounded-lg border bg-muted/50 p-4">
            <p className="text-sm font-medium text-muted-foreground mb-2">Agent ID</p>
            <p className="font-mono text-sm">{agent.id}</p>
          </div>

          <div className="space-y-4">
            <AgentModelPicker
              modelOptions={modelOptions}
              provider={formData.provider || ''}
              model={formData.model}
              disabled={modelsLoading}
              providerPlaceholder="Select provider"
              modelPlaceholder="Select model"
              onChange={({ provider, model }) => {
                setFormData((prev) => ({ ...prev, provider, model }));
                setHasChanges(true);
              }}
            />
          </div>

          <Separator />

          <div className="space-y-4">
            <h4 className="text-sm font-medium">Heartbeat Settings</h4>
            
            <div className="space-y-2">
              <Label htmlFor="edit-heartbeat-interval">Interval (seconds)</Label>
              <Input
                id="edit-heartbeat-interval"
                type="number"
                min={10}
                max={86400}
                value={formData.heartbeatInterval}
                onChange={(e) => handleChange('heartbeatInterval', parseInt(e.target.value))}
              />
              <p className="text-xs text-muted-foreground">
                Time between heartbeat task executions
              </p>
            </div>
          </div>

          <Separator />

          {reasoningSpec.visible ? (
            <div className="space-y-4">
              <h4 className="text-sm font-medium">Reasoning</h4>

              <div className="space-y-2">
                <Label htmlFor="edit-reasoning-effort">{reasoningSpec.label}</Label>
                <Select
                  value={formData.reasoningEffort}
                  onValueChange={(value) => handleChange('reasoningEffort', value)}
                >
                  <SelectTrigger id="edit-reasoning-effort">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {reasoningSpec.options.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {reasoningSpec.description}
                </p>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border bg-muted/20 p-4 text-sm text-muted-foreground">
              {reasoningSpec.description}
            </div>
          )}

          <div className="rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 p-4">
            <p className="text-sm text-amber-800 dark:text-amber-200">
              <strong>Note:</strong> For detailed configuration, use the Settings tab on the agent detail page.
            </p>
          </div>
        </div>

        <SheetFooter className="flex-col sm:flex-row gap-2">
          <div className="flex-1 text-sm text-muted-foreground">
            {hasChanges ? (
              <span className="text-amber-500">Unsaved changes</span>
            ) : (
              <span>Up to date</span>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={isSaving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={!hasChanges || isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  Save Changes
                </>
              )}
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
