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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
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
    historyMessages: agent.historyMessages ?? '',
    maxTurns: agent.maxTurns ?? '',
    compactKeepRecentTurns: agent.compactKeepRecentTurns ?? '',
    reasoningEffort: agent.reasoningEffort ?? '',
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
      historyMessages: agent.historyMessages ?? '',
      maxTurns: agent.maxTurns ?? '',
      compactKeepRecentTurns: agent.compactKeepRecentTurns ?? '',
      reasoningEffort: agent.reasoningEffort ?? '',
    });
  }, [agent, open]);

  const handleSave = async () => {
    await updateAgent.mutateAsync({
      id: agent.id,
      data: {
        model: formData.model,
        soul: formData.systemPrompt,
        history_messages: formData.historyMessages ? Number(formData.historyMessages) : undefined,
        max_turns: formData.maxTurns ? Number(formData.maxTurns) : undefined,
        compact_keep_recent_turns: formData.compactKeepRecentTurns ? Number(formData.compactKeepRecentTurns) : undefined,
        reasoning_effort: formData.reasoningEffort || undefined,
      },
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
          {/* Basic Info Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Basic Info</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
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
            </CardContent>
          </Card>

          {/* Model & Provider Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Model Settings</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
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
                <Label htmlFor="reasoningEffort">Reasoning Effort</Label>
                <Select
                  value={formData.reasoningEffort}
                  onValueChange={(v) => updateField('reasoningEffort', v)}
                >
                  <SelectTrigger id="reasoningEffort">
                    <SelectValue placeholder="Default (unset)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Default (unset)</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Controls extended thinking for Claude and reasoning effort for OpenAI o-series models.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Context & Conversation Limits Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Context & Limits</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid gap-4 md:grid-cols-3">
                <div className="grid gap-2">
                  <Label htmlFor="historyMessages">History Messages</Label>
                  <Input
                    id="historyMessages"
                    type="number"
                    value={formData.historyMessages}
                    onChange={(e) => updateField('historyMessages', e.target.value)}
                    placeholder="40"
                    min={1}
                  />
                  <p className="text-xs text-muted-foreground">Recent messages to load as context.</p>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="maxTurns">Max Turns</Label>
                  <Input
                    id="maxTurns"
                    type="number"
                    value={formData.maxTurns}
                    onChange={(e) => updateField('maxTurns', e.target.value)}
                    placeholder="20"
                    min={1}
                  />
                  <p className="text-xs text-muted-foreground">Max turns before compaction.</p>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="compactKeepRecentTurns">Keep Recent</Label>
                  <Input
                    id="compactKeepRecentTurns"
                    type="number"
                    value={formData.compactKeepRecentTurns}
                    onChange={(e) => updateField('compactKeepRecentTurns', e.target.value)}
                    placeholder="8"
                    min={0}
                  />
                  <p className="text-xs text-muted-foreground">Turns to keep during compaction.</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Separator />

          <div className="grid gap-2">
            <Label htmlFor="systemPrompt">System Prompt (SOUL.md)</Label>
            <Textarea
              id="systemPrompt"
              value={formData.systemPrompt}
              onChange={(e) => updateField('systemPrompt', e.target.value)}
              placeholder="System instructions for the agent..."
              rows={6}
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
