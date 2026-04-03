'use client';

import {
  AlertTriangle,
  ChevronDown,
  Clock,
  Code,
  Globe,
  Info,
  RotateCcw,
  Save,
  Wrench,
} from 'lucide-react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';

import type { AdvancedConfigData, AdvancedValidationErrors } from './types';

export function AdvancedLoadingState() {
  return (
    <div className='space-y-6'>
      <Card>
        <CardHeader>
          <Skeleton className='h-6 w-32' />
          <Skeleton className='h-4 w-48' />
        </CardHeader>
        <CardContent className='space-y-4'>
          <Skeleton className='h-10 w-full' />
          <Skeleton className='h-10 w-full' />
          <Skeleton className='h-10 w-full' />
        </CardContent>
      </Card>
    </div>
  );
}

export function UnsavedChangesAlert({ hasChanges }: { hasChanges: boolean }) {
  if (!hasChanges) {
    return null;
  }

  return (
    <Alert variant='warning' className='flex items-center justify-between'>
      <div className='flex items-start gap-3'>
        <Info className='mt-0.5 h-5 w-5 shrink-0' />
        <AlertDescription className='pt-0.5'>
          You have unsaved changes. Save or reset to continue.
        </AlertDescription>
      </div>
      <Badge variant='outline' className='ml-4 shrink-0'>
        Modified
      </Badge>
    </Alert>
  );
}

interface SessionCleanupCardProps {
  formData: AdvancedConfigData;
  errors: AdvancedValidationErrors;
  onNumberChange: (field: keyof AdvancedConfigData, value: string) => void;
  onTextChange: (field: keyof AdvancedConfigData, value: string) => void;
}

export function SessionCleanupCard({
  formData,
  errors,
  onNumberChange,
  onTextChange,
}: SessionCleanupCardProps) {
  return (
    <Card>
      <CardHeader>
        <div className='flex items-center gap-2'>
          <Clock className='h-5 w-5 text-muted-foreground' />
          <CardTitle>Session & Cleanup</CardTitle>
        </div>
        <CardDescription>Configure automatic session expiry and event cleanup</CardDescription>
      </CardHeader>
      <CardContent className='space-y-6'>
        <FormField
          label='Session expiry days'
          htmlFor='session-expiry'
          description='Days before inactive sessions are removed (0 = disabled)'
          error={errors.session_expiry_days}
        >
          <Input
            id='session-expiry'
            type='number'
            min={0}
            max={365}
            value={formData.session_expiry_days ?? ''}
            onChange={(event) => onNumberChange('session_expiry_days', event.target.value)}
            placeholder='30'
            className='max-w-[200px]'
          />
        </FormField>

        <Separator />

        <FormField
          label='Cron session expiry days'
          htmlFor='cron-session-expiry'
          description='Days before cron job sessions are cleaned up (0 = disabled)'
          error={errors.cron_session_expiry_days}
        >
          <Input
            id='cron-session-expiry'
            type='number'
            min={0}
            max={90}
            value={formData.cron_session_expiry_days ?? ''}
            onChange={(event) => onNumberChange('cron_session_expiry_days', event.target.value)}
            placeholder='7'
            className='max-w-[200px]'
          />
        </FormField>

        <Separator />

        <FormField
          label='Cron events max keep'
          htmlFor='cron-events-max'
          description='Maximum heartbeat event files to retain per agent'
          error={errors.cron_events_max_keep}
        >
          <Input
            id='cron-events-max'
            type='number'
            min={10}
            max={1000}
            value={formData.cron_events_max_keep ?? ''}
            onChange={(event) => onNumberChange('cron_events_max_keep', event.target.value)}
            placeholder='50'
            className='max-w-[200px]'
          />
        </FormField>

        <Separator />

        <FormField
          label='Timezone'
          htmlFor='timezone'
          description='IANA timezone for cron job scheduling (e.g., America/New_York)'
        >
          <Input
            id='timezone'
            type='text'
            value={formData.timezone ?? ''}
            onChange={(event) => onTextChange('timezone', event.target.value)}
            placeholder='UTC'
            className='max-w-[300px]'
          />
        </FormField>
      </CardContent>
    </Card>
  );
}

interface SkillsGatingCardProps {
  formData: AdvancedConfigData;
  onSkillsEnabledChange: (checked: boolean) => void;
  onSkillsListChange: (field: 'allow' | 'deny', value: string) => void;
}

export function SkillsGatingCard({
  formData,
  onSkillsEnabledChange,
  onSkillsListChange,
}: SkillsGatingCardProps) {
  return (
    <Card>
      <CardHeader>
        <div className='flex items-center gap-2'>
          <Wrench className='h-5 w-5 text-muted-foreground' />
          <CardTitle>Skills Gating</CardTitle>
        </div>
        <CardDescription>Control which skills are available to agents</CardDescription>
      </CardHeader>
      <CardContent className='space-y-6'>
        <div className='flex items-center justify-between'>
          <div className='space-y-0.5'>
            <Label htmlFor='skills-enabled'>Skills enabled</Label>
            <p className='text-sm text-muted-foreground'>
              Master switch for skill functionality
            </p>
          </div>
          <Switch
            id='skills-enabled'
            checked={formData.skills?.enabled ?? true}
            onCheckedChange={onSkillsEnabledChange}
          />
        </div>

        <Separator />

        <FormField
          label='Allow list'
          htmlFor='skills-allow'
          description='Comma-separated skill IDs to allow (empty = allow all)'
        >
          <Input
            id='skills-allow'
            type='text'
            value={formData.skills?.allow?.join(', ') ?? ''}
            onChange={(event) => onSkillsListChange('allow', event.target.value)}
            placeholder='skill-1, skill-2, skill-3'
            disabled={!formData.skills?.enabled}
          />
        </FormField>

        <Separator />

        <FormField
          label='Deny list'
          htmlFor='skills-deny'
          description='Comma-separated skill IDs to deny (applied after allow filter)'
        >
          <Input
            id='skills-deny'
            type='text'
            value={formData.skills?.deny?.join(', ') ?? ''}
            onChange={(event) => onSkillsListChange('deny', event.target.value)}
            placeholder='skill-4, skill-5'
            disabled={!formData.skills?.enabled}
          />
        </FormField>
      </CardContent>
    </Card>
  );
}

interface SystemCardProps {
  formData: AdvancedConfigData;
  onTextChange: (field: keyof AdvancedConfigData, value: string) => void;
}

export function SystemCard({ formData, onTextChange }: SystemCardProps) {
  return (
    <Card>
      <CardHeader>
        <div className='flex items-center gap-2'>
          <Globe className='h-5 w-5 text-muted-foreground' />
          <CardTitle>System</CardTitle>
        </div>
        <CardDescription>System-level configuration options</CardDescription>
      </CardHeader>
      <CardContent>
        <FormField
          label='Chromium path'
          htmlFor='chromium-path'
          description='Path to Chromium/Chrome executable for browser automation skills (optional)'
        >
          <Input
            id='chromium-path'
            type='text'
            value={formData.chromium_path ?? ''}
            onChange={(event) => onTextChange('chromium_path', event.target.value)}
            placeholder='/usr/bin/chromium'
          />
        </FormField>
      </CardContent>
    </Card>
  );
}

interface RawConfigCardProps {
  rawConfigOpen: boolean;
  setRawConfigOpen: (open: boolean) => void;
  rawConfigJson: string;
  isRawEditing: boolean;
  setIsRawEditing: (editing: boolean) => void;
  rawConfigError: string | null;
  hasRawChanges: boolean;
  isSaving: boolean;
  onRawConfigChange: (value: string) => void;
  onSaveRawConfig: () => void;
  onCancelRawEdit: () => void;
}

export function RawConfigCard({
  rawConfigOpen,
  setRawConfigOpen,
  rawConfigJson,
  isRawEditing,
  setIsRawEditing,
  rawConfigError,
  hasRawChanges,
  isSaving,
  onRawConfigChange,
  onSaveRawConfig,
  onCancelRawEdit,
}: RawConfigCardProps) {
  return (
    <Collapsible open={rawConfigOpen} onOpenChange={setRawConfigOpen}>
      <Card>
        <CardHeader className='pb-3'>
          <CollapsibleTrigger className='flex w-full items-center justify-between text-left'>
            <div className='flex items-center gap-2'>
              <Code className='h-5 w-5 text-muted-foreground' />
              <CardTitle>Raw Config</CardTitle>
            </div>
            <ChevronDown
              className={`h-5 w-5 text-muted-foreground transition-transform duration-200 ${
                rawConfigOpen ? 'rotate-180' : ''
              }`}
            />
          </CollapsibleTrigger>
          <CardDescription>Advanced: view and edit raw configuration JSON</CardDescription>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className='space-y-4 pt-0'>
            <Alert variant='warning'>
              <AlertTriangle className='h-4 w-4' />
              <AlertDescription>
                This is for advanced users only. Invalid configuration will be rejected by the
                backend. The server validates all changes against the config schema before saving.
              </AlertDescription>
            </Alert>

            <div className='flex items-center justify-between'>
              <div className='space-y-0.5'>
                <Label htmlFor='raw-edit-toggle'>Enable editing</Label>
                <p className='text-sm text-muted-foreground'>
                  Allow modification of raw configuration
                </p>
              </div>
              <Switch
                id='raw-edit-toggle'
                checked={isRawEditing}
                onCheckedChange={(checked) => {
                  if (checked) {
                    setIsRawEditing(true);
                    return;
                  }

                  onCancelRawEdit();
                }}
              />
            </div>

            <Separator />

            <FormField
              label='Configuration JSON'
              htmlFor='raw-config-json'
              description={
                isRawEditing ? 'Edit the configuration object as JSON' : 'View-only mode'
              }
              error={rawConfigError || undefined}
            >
              <Textarea
                id='raw-config-json'
                value={rawConfigJson}
                onChange={(event) => onRawConfigChange(event.target.value)}
                disabled={!isRawEditing}
                readOnly={!isRawEditing}
                className='min-h-[300px] max-h-[500px] resize-y font-mono text-sm'
                spellCheck={false}
              />
            </FormField>

            {isRawEditing && (
              <div className='flex justify-end gap-3'>
                <Button
                  variant='outline'
                  onClick={onCancelRawEdit}
                  disabled={!hasRawChanges && !rawConfigError}
                >
                  <RotateCcw className='mr-2 h-4 w-4' />
                  Cancel
                </Button>
                <Button
                  onClick={onSaveRawConfig}
                  disabled={!hasRawChanges || !!rawConfigError || isSaving}
                >
                  <Save className='mr-2 h-4 w-4' />
                  {isSaving ? 'Saving...' : 'Save Raw Config'}
                </Button>
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

interface DangerZoneCardProps {
  hasChanges: boolean;
  isSaving: boolean;
  onReset: () => void;
}

export function DangerZoneCard({ hasChanges, isSaving, onReset }: DangerZoneCardProps) {
  return (
    <Card className='border-destructive/20'>
      <CardHeader>
        <div className='flex items-center gap-2 text-destructive'>
          <AlertTriangle className='h-5 w-5' />
          <CardTitle className='text-destructive'>Danger Zone</CardTitle>
        </div>
        <CardDescription className='text-destructive/80'>
          Destructive actions that cannot be undone
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className='flex items-center justify-between'>
          <div className='space-y-0.5'>
            <Label>Reset to defaults</Label>
            <p className='text-sm text-muted-foreground'>
              Discard all changes and restore original values
            </p>
          </div>
          <Button variant='outline' onClick={onReset} disabled={!hasChanges || isSaving}>
            <RotateCcw className='mr-2 h-4 w-4' />
            Reset
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

interface StickyActionsBarProps {
  hasChanges: boolean;
  hasValidationErrors: boolean;
  isSaving: boolean;
  onReset: () => void;
  onSave: () => void;
}

export function StickyActionsBar({
  hasChanges,
  hasValidationErrors,
  isSaving,
  onReset,
  onSave,
}: StickyActionsBarProps) {
  return (
    <div className='sticky bottom-4 flex justify-end gap-3 rounded-lg border bg-background/95 p-4 backdrop-blur'>
      <Button variant='outline' onClick={onReset} disabled={!hasChanges || isSaving}>
        <RotateCcw className='mr-2 h-4 w-4' />
        Reset Changes
      </Button>
      <Button onClick={onSave} disabled={!hasChanges || hasValidationErrors || isSaving}>
        <Save className='mr-2 h-4 w-4' />
        {isSaving ? 'Saving...' : 'Save Changes'}
      </Button>
    </div>
  );
}

interface ResetChangesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

export function ResetChangesDialog({
  open,
  onOpenChange,
  onConfirm,
}: ResetChangesDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Reset changes?</AlertDialogTitle>
          <AlertDialogDescription>
            This will discard all your modifications and restore the values from the server. This
            action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => onOpenChange(false)}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className='bg-destructive text-destructive-foreground hover:bg-destructive/90'
          >
            Reset
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
