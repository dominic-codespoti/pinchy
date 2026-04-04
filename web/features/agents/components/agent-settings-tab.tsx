'use client';

import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Settings, Save, Heart, Wrench, Bot, Clock, AlertTriangle } from 'lucide-react';
import { Agent } from '../types';
import { useAvailableModels, useProvidersStatus } from '@/features/settings';
import { LIMITS } from '@/lib/config/timeouts';
import { FALLBACKS } from '@/lib/constants/fallbacks';

// Types
interface AgentSettingsData {
  config: Agent['config'];
  model?: string;
  provider?: string;
  heartbeatEnabled?: boolean;
  heartbeatInterval?: number;
  maxTurns?: number;
  historyMessages?: number;
  maxToolIterations?: number;
  reasoningEffort?: string;
  timezone?: string;
}

interface AgentSettingsTabProps {
  agent: Agent;
  isLoading?: boolean;
  onSave?: (settings: AgentSettingsData) => void | Promise<void>;
}

interface SectionCardProps {
  icon: React.ReactNode;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

interface SettingsSectionProps {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}

interface FormData {
  model: string;
  provider: string | undefined;
  heartbeatEnabled: boolean;
  heartbeatInterval: number;
  maxTurns: number;
  historyMessages: number;
  maxToolIterations: number;
  reasoningEffort: string;
  timezone: string;
}

// Constants
const REASONING_OPTIONS = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
];

// Sub-components
function SectionCard({ icon, title, description, children, footer }: SectionCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {icon}
          {title}
        </CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-6">
        {children}
      </CardContent>
      {footer && <CardFooter>{footer}</CardFooter>}
    </Card>
  );
}

function SettingsSection({ icon, title, children }: SettingsSectionProps) {
  return (
    <div className="space-y-4">
      <CardTitle className="flex items-center gap-2 text-sm font-medium">
        {icon}
        {title}
      </CardTitle>
      {children}
    </div>
  );
}

interface ModelProviderSectionProps {
  formData: FormData;
  models: { id: string; name: string; provider: string }[] | undefined;
  providers: { id: string; name: string; configured: boolean }[] | undefined;
  modelsLoading: boolean;
  providersLoading: boolean;
  onChange: (field: string, value: string | number | boolean) => void;
}

function ModelProviderSection({
  formData,
  models,
  providers,
  modelsLoading,
  providersLoading,
  onChange,
}: ModelProviderSectionProps) {
  // Deduplicate models by ID to avoid duplicate keys
  const seen = new Set<string>();
  const modelOptions = models?.filter((m) => {
    if (seen.has(m.id)) return false;
    seen.add(m.id);
    return true;
  }) ?? [];

  const providerOptions =
    providers
      ?.filter((p) => p.configured)
      ?.map((p) => ({ value: p.id, label: p.name || p.id })) || [];

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2">
        <Label htmlFor="provider">Provider</Label>
        <Select
          value={formData.provider || ''}
          onValueChange={(v) => onChange('provider', v)}
          disabled={providersLoading}
        >
          <SelectTrigger id="provider">
            <SelectValue placeholder={providersLoading ? 'Loading...' : 'Select provider'} />
          </SelectTrigger>
          <SelectContent>
            {providerOptions.length === 0 ? (
              <SelectItem value="__empty__" disabled>
                No configured providers
              </SelectItem>
            ) : (
              providerOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="model">Model</Label>
        <Select
          value={formData.model}
          onValueChange={(v) => onChange('model', v)}
          disabled={modelsLoading}
        >
          <SelectTrigger id="model">
            <SelectValue placeholder={modelsLoading ? 'Loading...' : 'Select model'} />
          </SelectTrigger>
          <SelectContent>
            {modelOptions.length === 0 ? (
              <SelectItem value="__empty__" disabled>
                No models available
              </SelectItem>
            ) : (
              modelOptions.map((option) => (
                <SelectItem key={`${option.provider}-${option.id}`} value={option.id}>
                  {option.name}
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

interface HeartbeatSettingsSectionProps {
  formData: FormData;
  onChange: (field: string, value: string | number | boolean) => void;
}

function HeartbeatSettingsSection({ formData, onChange }: HeartbeatSettingsSectionProps) {
  return (
    <SettingsSection icon={<Heart className="h-4 w-4" />} title="Heartbeat Settings">
      <div className="flex items-center space-x-2">
        <Checkbox
          id="heartbeat-enabled"
          checked={formData.heartbeatEnabled}
          onCheckedChange={(checked) => onChange('heartbeatEnabled', checked)}
        />
        <Label htmlFor="heartbeat-enabled" className="font-normal cursor-pointer">
          Enable heartbeat
        </Label>
      </div>

      {formData.heartbeatEnabled && (
        <div className="grid gap-4 sm:grid-cols-2 pt-2">
          <div className="space-y-2">
            <Label htmlFor="heartbeat-interval">Interval (seconds)</Label>
            <Input
              id="heartbeat-interval"
              type="number"
              min={LIMITS.MIN_HEARTBEAT_INTERVAL_SECONDS}
              max={LIMITS.MAX_HEARTBEAT_INTERVAL_SECONDS}
              value={formData.heartbeatInterval}
              onChange={(e) => onChange('heartbeatInterval', parseInt(e.target.value))}
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
              onChange={(e) => onChange('timezone', e.target.value)}
              placeholder="UTC"
            />
            <p className="text-xs text-muted-foreground">
              Agent&apos;s local timezone
            </p>
          </div>
        </div>
      )}
    </SettingsSection>
  );
}

interface ExecutionSettingsSectionProps {
  formData: FormData;
  onChange: (field: string, value: string | number | boolean) => void;
}

function ExecutionSettingsSection({ formData, onChange }: ExecutionSettingsSectionProps) {
  return (
    <SettingsSection icon={<Wrench className="h-4 w-4" />} title="Execution Settings">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="max-turns">Max Turns</Label>
          <Input
            id="max-turns"
            type="number"
            min={1}
            max={100}
            value={formData.maxTurns}
            onChange={(e) => onChange('maxTurns', parseInt(e.target.value))}
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
            onChange={(e) => onChange('maxToolIterations', parseInt(e.target.value))}
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
            onChange={(e) => onChange('historyMessages', parseInt(e.target.value))}
          />
          <p className="text-xs text-muted-foreground">
            Messages to keep in conversation history
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="reasoning-effort">Reasoning Effort</Label>
          <Select
            value={formData.reasoningEffort}
            onValueChange={(v) => onChange('reasoningEffort', v)}
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
    </SettingsSection>
  );
}

interface DangerZoneCardProps {
  agent: Agent;
}

function DangerZoneCard({ agent }: DangerZoneCardProps) {
  return (
    <Card className="border-destructive/50">
      <CardHeader>
        <CardTitle className="text-destructive flex items-center gap-2">
          <AlertTriangle className="h-5 w-5" />
          Danger Zone
        </CardTitle>
        <CardDescription>Destructive actions for {agent.name}</CardDescription>
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
  );
}

// Loading skeleton component
function AgentSettingsSkeleton() {
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

// Main component
export function AgentSettingsTab({ agent, isLoading, onSave }: AgentSettingsTabProps) {
  const [formData, setFormData] = useState<FormData>({
    model: agent.config.model || '',
    provider: agent.config.provider,
    heartbeatEnabled: agent.hasHeartbeat ?? false,
    heartbeatInterval: agent.heartbeatInterval || 60,
    maxTurns: agent.maxTurns || 10,
    historyMessages: agent.historyMessages || 5,
    maxToolIterations: agent.maxToolIterations || 5,
    reasoningEffort: agent.reasoningEffort || 'medium',
    timezone: agent.timezone || FALLBACKS.TIMEZONE,
  });

  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  const { data: models, isLoading: modelsLoading } = useAvailableModels();
  const { data: providers, isLoading: providersLoading } = useProvidersStatus();

  const handleChange = (field: string, value: string | number | boolean) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setHasChanges(true);
  };

  const handleSave = async () => {
    console.log('Saving settings:', { 
      model: formData.model, 
      provider: formData.provider,
      heartbeatEnabled: formData.heartbeatEnabled 
    });
    setIsSaving(true);
    try {
      await onSave?.({
        config: {
          ...agent.config,
          model: formData.model,
          provider: formData.provider || agent.config.provider,
        },
        // Also pass at top level for the hook
        model: formData.model,
        provider: formData.provider,
        heartbeatEnabled: formData.heartbeatEnabled,
        heartbeatInterval: formData.heartbeatEnabled ? formData.heartbeatInterval : undefined,
        maxTurns: formData.maxTurns,
        historyMessages: formData.historyMessages,
        maxToolIterations: formData.maxToolIterations,
        reasoningEffort: formData.reasoningEffort,
        timezone: formData.timezone,
      });
      console.log('Settings saved successfully');
      setHasChanges(false);
    } catch (err) {
      console.error('Failed to save settings:', err);
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return <AgentSettingsSkeleton />;
  }

  return (
    <div className="space-y-4">
      <SectionCard
        icon={<Settings className="h-5 w-5" />}
        title="Agent Settings"
        description={`Configure behavior and parameters for ${agent.name}`}
        footer={
          <div className="flex w-full items-center justify-between">
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
        }
      >
        <ModelProviderSection
          formData={formData}
          models={models}
          providers={providers}
          modelsLoading={modelsLoading}
          providersLoading={providersLoading}
          onChange={handleChange}
        />

        <Separator />

        <HeartbeatSettingsSection formData={formData} onChange={handleChange} />

        <Separator />

        <ExecutionSettingsSection formData={formData} onChange={handleChange} />
      </SectionCard>

      <DangerZoneCard agent={agent} />
    </div>
  );
}
