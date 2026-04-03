'use client';

import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Settings, Save, Heart, Wrench, Bot, Clock } from 'lucide-react';
import { Agent } from '../types';

interface AgentSettingsTabProps {
  agent: Agent;
  isLoading?: boolean;
  onSave?: (settings: Partial<Agent>) => void;
}

const MODEL_OPTIONS = [
  { value: 'gpt-4o', label: 'GPT-4o' },
  { value: 'gpt-4', label: 'GPT-4' },
  { value: 'claude-sonnet-4', label: 'Claude Sonnet 4' },
  { value: 'claude-opus', label: 'Claude Opus' },
  { value: 'claude-haiku', label: 'Claude Haiku' },
];

const PROVIDER_OPTIONS = [
  { value: 'copilot', label: 'GitHub Copilot' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'azure', label: 'Azure OpenAI' },
];

const REASONING_OPTIONS = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
];

export function AgentSettingsTab({ agent, isLoading, onSave }: AgentSettingsTabProps) {
  const [formData, setFormData] = useState({
    model: agent.config.model || '',
    provider: agent.config.provider,
    heartbeatInterval: agent.heartbeatInterval || 60,
    maxTurns: agent.maxTurns || 10,
    historyMessages: agent.historyMessages || 5,
    maxToolIterations: agent.maxToolIterations || 5,
    reasoningEffort: agent.reasoningEffort || 'medium',
    timezone: agent.timezone || 'UTC',
  });
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  const handleChange = (field: string, value: string | number) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setHasChanges(true);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave?.({
        config: {
          ...agent.config,
          model: formData.model,
          provider: formData.provider,
        },
        heartbeatInterval: formData.heartbeatInterval,
        maxTurns: formData.maxTurns,
        historyMessages: formData.historyMessages,
        maxToolIterations: formData.maxToolIterations,
        reasoningEffort: formData.reasoningEffort,
        timezone: formData.timezone,
      });
      setHasChanges(false);
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-4 w-48" />
        </CardHeader>
        <CardContent className="space-y-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-10 w-full" />
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Agent Settings
          </CardTitle>
          <CardDescription>Configure behavior and parameters for {agent.name}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="provider">Provider</Label>
              <Select
                value={formData.provider}
                onValueChange={(v) => handleChange('provider', v)}
              >
                <SelectTrigger id="provider">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROVIDER_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="model">Model</Label>
              <Select
                value={formData.model}
                onValueChange={(v) => handleChange('model', v)}
              >
                <SelectTrigger id="model">
                  <SelectValue placeholder="Select model" />
                </SelectTrigger>
                <SelectContent>
                  {MODEL_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Separator />

          <div>
            <h4 className="mb-4 flex items-center gap-2 text-sm font-medium">
              <Heart className="h-4 w-4" />
              Heartbeat Settings
            </h4>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="heartbeat-interval">Interval (seconds)</Label>
                <Input
                  id="heartbeat-interval"
                  type="number"
                  min={10}
                  max={86400}
                  value={formData.heartbeatInterval}
                  onChange={(e) => handleChange('heartbeatInterval', parseInt(e.target.value))}
                />
                <p className="text-xs text-muted-foreground">
                  Time between heartbeat checks
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="timezone">Timezone</Label>
                <Input
                  id="timezone"
                  value={formData.timezone}
                  onChange={(e) => handleChange('timezone', e.target.value)}
                  placeholder="UTC"
                />
                <p className="text-xs text-muted-foreground">
                  Agent&apos;s local timezone
                </p>
              </div>
            </div>
          </div>

          <Separator />

          <div>
            <h4 className="mb-4 flex items-center gap-2 text-sm font-medium">
              <Wrench className="h-4 w-4" />
              Execution Settings
            </h4>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="max-turns">Max Turns</Label>
                <Input
                  id="max-turns"
                  type="number"
                  min={1}
                  max={100}
                  value={formData.maxTurns}
                  onChange={(e) => handleChange('maxTurns', parseInt(e.target.value))}
                />
                <p className="text-xs text-muted-foreground">
                  Maximum conversation turns per session
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="max-tool-iterations">Max Tool Iterations</Label>
                <Input
                  id="max-tool-iterations"
                  type="number"
                  min={1}
                  max={50}
                  value={formData.maxToolIterations}
                  onChange={(e) => handleChange('maxToolIterations', parseInt(e.target.value))}
                />
                <p className="text-xs text-muted-foreground">
                  Maximum tool call loops per turn
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="history-messages">History Messages</Label>
                <Input
                  id="history-messages"
                  type="number"
                  min={1}
                  max={50}
                  value={formData.historyMessages}
                  onChange={(e) => handleChange('historyMessages', parseInt(e.target.value))}
                />
                <p className="text-xs text-muted-foreground">
                  Messages to keep in conversation history
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="reasoning-effort">Reasoning Effort</Label>
                <Select
                  value={formData.reasoningEffort}
                  onValueChange={(v) => handleChange('reasoningEffort', v)}
                >
                  <SelectTrigger id="reasoning-effort">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {REASONING_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Depth of reasoning for complex tasks
                </p>
              </div>
            </div>
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              {hasChanges ? (
                <span className="text-amber-500">Unsaved changes</span>
              ) : (
                <span>All changes saved</span>
              )}
            </div>
            <Button onClick={handleSave} disabled={isSaving || !hasChanges}>
              <Save className="mr-2 h-4 w-4" />
              {isSaving ? 'Saving...' : 'Save Settings'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle className="text-destructive">Danger Zone</CardTitle>
          <CardDescription>Destructive actions for this agent</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Reset Agent State</p>
              <p className="text-sm text-muted-foreground">
                Clear all sessions and reset to initial state
              </p>
            </div>
            <Button variant="outline">Reset</Button>
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-destructive">Delete Agent</p>
              <p className="text-sm text-muted-foreground">
                Permanently delete this agent and all its data
              </p>
            </div>
            <Button variant="destructive">Delete</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
