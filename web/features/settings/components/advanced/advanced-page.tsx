'use client';

import { useState, useEffect } from 'react';
import { Settings2, Save, RotateCcw } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { useConfig, useUpdateConfig } from '../hooks/use-config';

interface ConfigData {
  max_context_tokens?: number;
  max_turns?: number;
  compact_keep_recent_turns?: number;
  session_expiry_days?: number;
  cron_session_expiry_days?: number;
  cron_events_max_keep?: number;
  timezone?: string;
  skills?: {
    enabled?: boolean;
    allow?: string[];
    deny?: string[];
  };
  chromium_path?: string;
}

export function AdvancedPage() {
  const { data: config, isLoading } = useConfig();
  const updateConfig = useUpdateConfig();

  // Local state for form values
  const [formData, setFormData] = useState<ConfigData>({});
  const [hasChanges, setHasChanges] = useState(false);

  // Sync form data when config loads
  useEffect(() => {
    if (config) {
      setFormData({
        max_context_tokens: (config.max_context_tokens as number) ?? 128000,
        max_turns: (config.max_turns as number) ?? 20,
        compact_keep_recent_turns: (config.compact_keep_recent_turns as number) ?? 8,
        session_expiry_days: (config.session_expiry_days as number) ?? 30,
        cron_session_expiry_days: (config.cron_session_expiry_days as number) ?? 7,
        cron_events_max_keep: (config.cron_events_max_keep as number) ?? 50,
        timezone: (config.timezone as string) ?? 'UTC',
        skills: {
          enabled: (config.skills as { enabled?: boolean })?.enabled ?? true,
          allow: (config.skills as { allow?: string[] })?.allow ?? [],
          deny: (config.skills as { deny?: string[] })?.deny ?? [],
        },
        chromium_path: (config.chromium_path as string) ?? '',
      });
      setHasChanges(false);
    }
  }, [config]);

  const handleNumberChange = (field: keyof ConfigData, value: string) => {
    const numValue = value === '' ? undefined : parseInt(value, 10);
    setFormData((prev) => ({ ...prev, [field]: numValue }));
    setHasChanges(true);
  };

  const handleTextChange = (field: keyof ConfigData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setHasChanges(true);
  };

  const handleSkillsEnabledChange = (checked: boolean) => {
    setFormData((prev) => ({
      ...prev,
      skills: { ...prev.skills, enabled: checked },
    }));
    setHasChanges(true);
  };

  const handleSkillsListChange = (field: 'allow' | 'deny', value: string) => {
    const list = value
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    setFormData((prev) => ({
      ...prev,
      skills: { ...prev.skills, [field]: list },
    }));
    setHasChanges(true);
  };

  const handleSave = () => {
    const updatePayload: Record<string, unknown> = {};

    if (formData.max_context_tokens !== undefined) {
      updatePayload.max_context_tokens = formData.max_context_tokens;
    }
    if (formData.max_turns !== undefined) {
      updatePayload.max_turns = formData.max_turns;
    }
    if (formData.compact_keep_recent_turns !== undefined) {
      updatePayload.compact_keep_recent_turns = formData.compact_keep_recent_turns;
    }
    if (formData.session_expiry_days !== undefined) {
      updatePayload.session_expiry_days = formData.session_expiry_days;
    }
    if (formData.cron_session_expiry_days !== undefined) {
      updatePayload.cron_session_expiry_days = formData.cron_session_expiry_days;
    }
    if (formData.cron_events_max_keep !== undefined) {
      updatePayload.cron_events_max_keep = formData.cron_events_max_keep;
    }
    if (formData.timezone !== undefined) {
      updatePayload.timezone = formData.timezone;
    }
    if (formData.skills !== undefined) {
      updatePayload.skills = formData.skills;
    }
    if (formData.chromium_path !== undefined) {
      updatePayload.chromium_path = formData.chromium_path || undefined;
    }

    updateConfig.mutate(updatePayload, {
      onSuccess: () => {
        setHasChanges(false);
      },
    });
  };

  const handleReset = () => {
    if (config) {
      setFormData({
        max_context_tokens: (config.max_context_tokens as number) ?? 128000,
        max_turns: (config.max_turns as number) ?? 20,
        compact_keep_recent_turns: (config.compact_keep_recent_turns as number) ?? 8,
        session_expiry_days: (config.session_expiry_days as number) ?? 30,
        cron_session_expiry_days: (config.cron_session_expiry_days as number) ?? 7,
        cron_events_max_keep: (config.cron_events_max_keep as number) ?? 50,
        timezone: (config.timezone as string) ?? 'UTC',
        skills: {
          enabled: (config.skills as { enabled?: boolean })?.enabled ?? true,
          allow: (config.skills as { allow?: string[] })?.allow ?? [],
          deny: (config.skills as { deny?: string[] })?.deny ?? [],
        },
        chromium_path: (config.chromium_path as string) ?? '',
      });
      setHasChanges(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-4 w-48" />
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-4 w-48" />
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Context Window Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Settings2 className="h-5 w-5" />
            <CardTitle>Context Window</CardTitle>
          </div>
          <CardDescription>Configure context window management and compaction settings</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="max-context-tokens">Max context tokens</Label>
            <Input
              id="max-context-tokens"
              type="number"
              value={formData.max_context_tokens ?? ''}
              onChange={(e) => handleNumberChange('max_context_tokens', e.target.value)}
              placeholder="128000"
            />
            <p className="text-xs text-muted-foreground">
              Maximum number of tokens to keep in context before pruning
            </p>
          </div>

          <Separator />

          <div className="space-y-2">
            <Label htmlFor="max-turns">Max turns</Label>
            <Input
              id="max-turns"
              type="number"
              value={formData.max_turns ?? ''}
              onChange={(e) => handleNumberChange('max_turns', e.target.value)}
              placeholder="20"
            />
            <p className="text-xs text-muted-foreground">
              Maximum conversation turns before compaction kicks in
            </p>
          </div>

          <Separator />

          <div className="space-y-2">
            <Label htmlFor="compact-keep-recent">Compact keep recent turns</Label>
            <Input
              id="compact-keep-recent"
              type="number"
              value={formData.compact_keep_recent_turns ?? ''}
              onChange={(e) => handleNumberChange('compact_keep_recent_turns', e.target.value)}
              placeholder="8"
            />
            <p className="text-xs text-muted-foreground">
              Number of recent turns to preserve during compaction
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Session Management Section */}
      <Card>
        <CardHeader>
          <CardTitle>Session Management</CardTitle>
          <CardDescription>Configure session expiry and cleanup settings</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="session-expiry">Session expiry days</Label>
            <Input
              id="session-expiry"
              type="number"
              value={formData.session_expiry_days ?? ''}
              onChange={(e) => handleNumberChange('session_expiry_days', e.target.value)}
              placeholder="30"
            />
            <p className="text-xs text-muted-foreground">
              Days before sessions are automatically cleaned up (0 to disable)
            </p>
          </div>

          <Separator />

          <div className="space-y-2">
            <Label htmlFor="cron-session-expiry">Cron session expiry days</Label>
            <Input
              id="cron-session-expiry"
              type="number"
              value={formData.cron_session_expiry_days ?? ''}
              onChange={(e) => handleNumberChange('cron_session_expiry_days', e.target.value)}
              placeholder="7"
            />
            <p className="text-xs text-muted-foreground">
              Days before cron sessions are cleaned up (shorter-lived sessions)
            </p>
          </div>

          <Separator />

          <div className="space-y-2">
            <Label htmlFor="cron-events-max">Cron events max keep</Label>
            <Input
              id="cron-events-max"
              type="number"
              value={formData.cron_events_max_keep ?? ''}
              onChange={(e) => handleNumberChange('cron_events_max_keep', e.target.value)}
              placeholder="50"
            />
            <p className="text-xs text-muted-foreground">
              Maximum number of heartbeat event files to keep per agent
            </p>
          </div>

          <Separator />

          <div className="space-y-2">
            <Label htmlFor="timezone">Timezone</Label>
            <Input
              id="timezone"
              type="text"
              value={formData.timezone ?? ''}
              onChange={(e) => handleTextChange('timezone', e.target.value)}
              placeholder="UTC"
            />
            <p className="text-xs text-muted-foreground">
              IANA timezone for cron scheduling (e.g., America/New_York, Europe/London)
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Skills Gating Section */}
      <Card>
        <CardHeader>
          <CardTitle>Skills Gating</CardTitle>
          <CardDescription>Control which skills are available globally</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="skills-enabled">Skills enabled</Label>
              <p className="text-sm text-muted-foreground">Master switch for skill functionality</p>
            </div>
            <Switch
              id="skills-enabled"
              checked={formData.skills?.enabled ?? true}
              onCheckedChange={handleSkillsEnabledChange}
            />
          </div>

          <Separator />

          <div className="space-y-2">
            <Label htmlFor="skills-allow">Allow list</Label>
            <Input
              id="skills-allow"
              type="text"
              value={formData.skills?.allow?.join(', ') ?? ''}
              onChange={(e) => handleSkillsListChange('allow', e.target.value)}
              placeholder="skill-1, skill-2, skill-3"
              disabled={!formData.skills?.enabled}
            />
            <p className="text-xs text-muted-foreground">
              Comma-separated list of allowed skill IDs (empty = allow all)
            </p>
          </div>

          <Separator />

          <div className="space-y-2">
            <Label htmlFor="skills-deny">Deny list</Label>
            <Input
              id="skills-deny"
              type="text"
              value={formData.skills?.deny?.join(', ') ?? ''}
              onChange={(e) => handleSkillsListChange('deny', e.target.value)}
              placeholder="skill-4, skill-5"
              disabled={!formData.skills?.enabled}
            />
            <p className="text-xs text-muted-foreground">
              Comma-separated list of denied skill IDs (removed after allow filtering)
            </p>
          </div>
        </CardContent>
      </Card>

      {/* System Section */}
      <Card>
        <CardHeader>
          <CardTitle>System</CardTitle>
          <CardDescription>System-level configuration options</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="chromium-path">Chromium path</Label>
            <Input
              id="chromium-path"
              type="text"
              value={formData.chromium_path ?? ''}
              onChange={(e) => handleTextChange('chromium_path', e.target.value)}
              placeholder="/usr/bin/chromium"
            />
            <p className="text-xs text-muted-foreground">
              Path to Chromium/Chrome executable for browser automation skills
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Action buttons */}
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={handleReset} disabled={!hasChanges || updateConfig.isPending}>
          <RotateCcw className="mr-2 h-4 w-4" />
          Reset
        </Button>
        <Button onClick={handleSave} disabled={!hasChanges || updateConfig.isPending}>
          <Save className="mr-2 h-4 w-4" />
          {updateConfig.isPending ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>
    </div>
  );
}
