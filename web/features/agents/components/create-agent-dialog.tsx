'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, Loader2 } from 'lucide-react';
import { useAgentModels } from '@/features/settings';
import { AgentModelPicker } from './agent-model-picker';
import { normalizeAgentModelSelection } from '../model-options';

interface CreateAgentDialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onCreate?: (data: { id: string; model: string; provider: string }) => Promise<void>;
  trigger?: React.ReactNode;
}

export function CreateAgentDialog({ open: controlledOpen, onOpenChange, onCreate, trigger }: CreateAgentDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = (value: boolean) => {
    setInternalOpen(value);
    onOpenChange?.(value);
  };
  const [isCreating, setIsCreating] = useState(false);
  const [formData, setFormData] = useState({
    id: '',
    model: '',
    provider: '',
  });
  const [error, setError] = useState<string | null>(null);

  const { data: models, isLoading: modelsLoading } = useAgentModels();

  const modelOptions = models || [];
  const selection = normalizeAgentModelSelection(formData.provider, formData.model, modelOptions);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!formData.id.trim()) {
      setError('Agent ID is required');
      return;
    }

    if (!/^[a-z0-9_-]+$/.test(formData.id)) {
      setError('Agent ID can only contain lowercase letters, numbers, underscores, and hyphens');
      return;
    }

    setIsCreating(true);
    try {
      await onCreate?.({
        ...formData,
        model: selection.model,
        provider: selection.provider,
      });
      setOpen(false);
      setFormData({ id: '', model: '', provider: '' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create agent');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            New Agent
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Create New Agent</DialogTitle>
            <DialogDescription>
              Create a new AI agent with the specified configuration.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="agent-id">
                Agent ID <span className="text-destructive">*</span>
              </Label>
              <Input
                id="agent-id"
                placeholder="e.g., code-reviewer, assistant-v1"
                value={formData.id}
                onChange={(e) => setFormData((prev) => ({ ...prev, id: e.target.value }))}
                disabled={isCreating}
              />
              <p className="text-xs text-muted-foreground">
                Unique identifier for your agent. Use lowercase letters, numbers, underscores, and hyphens.
              </p>
            </div>

            <AgentModelPicker
              modelOptions={modelOptions}
              provider={formData.provider}
              model={formData.model}
              disabled={isCreating || modelsLoading}
              providerPlaceholder="Select provider"
              modelPlaceholder="Select model"
              onChange={({ provider, model }) => setFormData((prev) => ({ ...prev, provider, model }))}
            />

            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isCreating}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isCreating}>
              {isCreating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                'Create Agent'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
