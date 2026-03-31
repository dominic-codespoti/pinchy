'use client';

import { useState, useEffect } from 'react';
import { Agent } from '../types';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useUpdateAgent } from '../hooks';

interface EditDialogProps {
  agent: Agent;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditDialog({ agent, open, onOpenChange }: EditDialogProps) {
  const [formData, setFormData] = useState({
    name: agent.name,
    description: agent.description ?? '',
    status: agent.status,
    model: agent.config.model,
    provider: agent.config.provider,
    systemPrompt: agent.config.systemPrompt ?? '',
  });
  const updateAgent = useUpdateAgent();

  useEffect(() => {
    setFormData({
      name: agent.name,
      description: agent.description ?? '',
      status: agent.status,
      model: agent.config.model,
      provider: agent.config.provider,
      systemPrompt: agent.config.systemPrompt ?? '',
    });
  }, [agent, open]);

  const handleSave = async () => {
    await updateAgent.mutateAsync({
      id: agent.id,
      data: { model: formData.model, soul: formData.systemPrompt },
    });
    onOpenChange(false);
  };

  const updateField = (field: string, value: string | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Agent</DialogTitle>
          <DialogDescription>Update agent configuration and settings.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 py-4">
          <div className="grid gap-2">
            <Label htmlFor="name">Name</Label>
            <Input id="name" value={formData.name} disabled />
            <p className="text-xs text-muted-foreground">Agent name cannot be changed after creation.</p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => updateField('description', e.target.value)}
              rows={2}
            />
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="status">Active</Label>
            <Switch
              id="status"
              checked={formData.status === 'active'}
              onCheckedChange={(checked) => updateField('status', checked ? 'active' : 'inactive')}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="model">Model</Label>
              <Input
                id="model"
                value={formData.model}
                onChange={(e) => updateField('model', e.target.value)}
                placeholder="gpt-4"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="provider">Provider</Label>
              <Select value={formData.provider} onValueChange={(v) => updateField('provider', v)}>
                <SelectTrigger id="provider"><SelectValue placeholder="Select provider" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="openai">OpenAI</SelectItem>
                  <SelectItem value="azure">Azure OpenAI</SelectItem>
                  <SelectItem value="copilot">Copilot</SelectItem>
                  <SelectItem value="openai-compat">OpenAI Compatible</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="systemPrompt">System Prompt</Label>
            <Textarea
              id="systemPrompt"
              value={formData.systemPrompt}
              onChange={(e) => updateField('systemPrompt', e.target.value)}
              placeholder="System instructions for the agent..."
              rows={4}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={updateAgent.isPending}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={updateAgent.isPending}>
            {updateAgent.isPending ? 'Saving...' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
