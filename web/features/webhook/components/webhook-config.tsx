/**
 * Webhook Configuration Component
 */

'use client';

import { useState, useCallback } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Webhook,
  Copy,
  RefreshCw,
  Send,
  Check,
  AlertCircle,
  Eye,
  EyeOff,
  Trash2,
  Terminal,
} from 'lucide-react';
import { toast } from 'sonner';
import { useWebhookConfig, useUpdateWebhookConfig, useWebhookDeliveries, useTestWebhook } from '../hooks';
import { WEBHOOK_EVENT_TYPES } from '../types';

interface WebhookConfigProps {
  agentId: string;
}

export function WebhookConfig({ agentId }: WebhookConfigProps) {
  const { config, isLoading: isLoadingConfig, refetch } = useWebhookConfig(agentId);
  const { deliveries, isLoading: isLoadingDeliveries } = useWebhookDeliveries(agentId);
  const { updateConfig, isPending: isUpdating } = useUpdateWebhookConfig();
  const { sendTest, isPending: isTesting, data: testResult } = useTestWebhook();

  const [showSecret, setShowSecret] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [formData, setFormData] = useState({
    enabled: false,
    secret: '',
    eventTypes: ['*'],
  });

  // Sync form data when config loads
  if (config && !hasChanges && formData.enabled !== config.enabled) {
    setFormData({
      enabled: config.enabled,
      secret: config.secret || '',
      eventTypes: config.event_types,
    });
  }

  const handleToggleEnabled = useCallback((checked: boolean) => {
    setFormData((prev) => ({ ...prev, enabled: checked }));
    setHasChanges(true);
  }, []);

  const handleSecretChange = useCallback((value: string) => {
    setFormData((prev) => ({ ...prev, secret: value }));
    setHasChanges(true);
  }, []);

  const handleEventTypesChange = useCallback((value: string) => {
    setFormData((prev) => ({ ...prev, eventTypes: [value] }));
    setHasChanges(true);
  }, []);

  const handleRegenerateSecret = useCallback(() => {
    const newSecret = `whsec_${Array.from(crypto.getRandomValues(new Uint8Array(32)))
      .map((b) => b.toString(36).padStart(2, '0'))
      .join('')}`;
    setFormData((prev) => ({ ...prev, secret: newSecret }));
    setHasChanges(true);
    toast.success('New secret generated');
  }, []);

  const handleSave = useCallback(async () => {
    await updateConfig(agentId, {
      enabled: formData.enabled,
      secret: formData.enabled ? formData.secret : undefined,
      event_types: formData.eventTypes,
    });
    setHasChanges(false);
  }, [agentId, formData, updateConfig]);

  const handleCopyUrl = useCallback(() => {
    const baseUrl = window.location.origin;
    const fullUrl = `${baseUrl}${config?.url || `/api/webhook/${agentId}`}`;
    navigator.clipboard.writeText(fullUrl);
    toast.success('Webhook URL copied to clipboard');
  }, [config?.url, agentId]);

  const handleCopySecret = useCallback(() => {
    if (formData.secret) {
      navigator.clipboard.writeText(formData.secret);
      toast.success('Secret copied to clipboard');
    }
  }, [formData.secret]);

  const handleTestWebhook = useCallback(async () => {
    await sendTest(agentId, {
      event_type: 'test',
      payload: {
        test: true,
        timestamp: Date.now(),
        message: 'Manual test from webhook configuration UI',
      },
    });
  }, [agentId, sendTest]);

  const handleClearSecret = useCallback(() => {
    setFormData((prev) => ({ ...prev, secret: '', enabled: false }));
    setHasChanges(true);
  }, []);

  if (isLoadingConfig) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-72" />
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-20 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  const webhookUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}${config?.url || `/api/webhook/${agentId}`}`;
  const curlExample = `curl -X POST "${webhookUrl}?secret=${formData.secret || 'YOUR_SECRET'}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"event":"test","data":"Hello from webhook"}'`;

  return (
    <div className="space-y-6">
      {/* Webhook Configuration Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Webhook className="h-5 w-5" />
            Webhook Configuration
          </CardTitle>
          <CardDescription>
            Configure external webhooks to trigger this agent
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Enable/Disable Toggle */}
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-0.5">
              <Label htmlFor="webhook-enabled" className="text-base">Enable Webhook</Label>
              <p className="text-sm text-muted-foreground">
                Allow external services to trigger this agent via HTTP POST
              </p>
            </div>
            <Switch
              id="webhook-enabled"
              checked={formData.enabled}
              onCheckedChange={handleToggleEnabled}
            />
          </div>

          {/* Webhook URL */}
          <div className="space-y-2">
            <Label htmlFor="webhook-url">Webhook URL</Label>
            <div className="flex gap-2">
              <Input
                id="webhook-url"
                value={webhookUrl}
                readOnly
                className="font-mono text-sm"
              />
              <Button variant="outline" size="icon" onClick={handleCopyUrl}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Send POST requests to this URL to trigger the agent
            </p>
          </div>

          {/* Secret Configuration */}
          {formData.enabled && (
            <>
              <Separator />
              
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label htmlFor="webhook-secret">Webhook Secret</Label>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleRegenerateSecret}
                      disabled={isUpdating}
                    >
                      <RefreshCw className="mr-2 h-3 w-3" />
                      Regenerate
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleClearSecret}
                      disabled={isUpdating}
                    >
                      <Trash2 className="mr-2 h-3 w-3" />
                      Clear
                    </Button>
                  </div>
                </div>
                
                <div className="flex gap-2">
                  <Input
                    id="webhook-secret"
                    type={showSecret ? 'text' : 'password'}
                    value={formData.secret}
                    onChange={(e) => handleSecretChange(e.target.value)}
                    placeholder="Enter webhook secret or generate one"
                    className="font-mono text-sm"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setShowSecret(!showSecret)}
                  >
                    {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                  <Button variant="outline" size="icon" onClick={handleCopySecret}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                
                <p className="text-xs text-muted-foreground">
                  Use this secret to verify webhook requests. Include it as a query parameter:{' '}
                  <code className="rounded bg-muted px-1 py-0.5">?secret=YOUR_SECRET</code>
                </p>
              </div>

              {/* Event Types */}
              <div className="space-y-2">
                <Label htmlFor="event-types">Event Types</Label>
                <Select
                  value={formData.eventTypes[0]}
                  onValueChange={handleEventTypesChange}
                >
                  <SelectTrigger id="event-types">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {WEBHOOK_EVENT_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        <div className="flex flex-col">
                          <span>{type.label}</span>
                          <span className="text-xs text-muted-foreground">
                            {type.description}
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          {/* cURL Example */}
          {formData.enabled && formData.secret && (
            <>
              <Separator />
              
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Terminal className="h-4 w-4" />
                  Example cURL Command
                </Label>
                <pre className="rounded-md bg-muted p-3 text-xs overflow-x-auto">
                  <code>{curlExample}</code>
                </pre>
                <p className="text-xs text-muted-foreground">
                  Copy and run this command to test the webhook endpoint
                </p>
              </div>
            </>
          )}
        </CardContent>

        <CardFooter className="flex justify-between border-t px-6 py-4">
          <div className="flex items-center gap-2">
            {hasChanges ? (
              <Badge variant="outline" className="text-amber-500">
                <AlertCircle className="mr-1 h-3 w-3" />
                Unsaved changes
              </Badge>
            ) : (
              <Badge variant="outline" className="text-green-500">
                <Check className="mr-1 h-3 w-3" />
                Up to date
              </Badge>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => {
                refetch();
                toast.success('Configuration refreshed');
              }}
              disabled={isUpdating}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
            <Button
              onClick={handleSave}
              disabled={isUpdating || !hasChanges}
            >
              {isUpdating ? 'Saving...' : 'Save Configuration'}
            </Button>
          </div>
        </CardFooter>
      </Card>

      {/* Test Webhook Card */}
      {formData.enabled && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Send className="h-5 w-5" />
              Test Webhook
            </CardTitle>
            <CardDescription>
              Send a test webhook to verify your configuration
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <Button
                onClick={handleTestWebhook}
                disabled={isTesting || !formData.secret}
              >
                <Send className="mr-2 h-4 w-4" />
                {isTesting ? 'Sending...' : 'Send Test Webhook'}
              </Button>
              {testResult && (
                <div className="flex items-center gap-2">
                  {testResult.success ? (
                    <Badge variant="default" className="text-green-500">
                      <Check className="mr-1 h-3 w-3" />
                      Success
                    </Badge>
                  ) : (
                    <Badge variant="destructive">
                      <AlertCircle className="mr-1 h-3 w-3" />
                      Failed
                    </Badge>
                  )}
                  <span className="text-sm text-muted-foreground">
                    {testResult.message}
                  </span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Delivery Log Card */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Deliveries</CardTitle>
          <CardDescription>
            History of webhook deliveries (last 24 hours)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingDeliveries ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : deliveries && deliveries.deliveries.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Event Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Duration</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {deliveries.deliveries.map((delivery) => (
                  <TableRow key={delivery.id}>
                    <TableCell className="font-mono text-xs">
                      {new Date(delivery.timestamp * 1000).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{delivery.event_type}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          delivery.status === 'success'
                            ? 'default'
                            : delivery.status === 'failed'
                            ? 'destructive'
                            : 'secondary'
                        }
                      >
                        {delivery.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {delivery.duration_ms
                        ? `${delivery.duration_ms}ms`
                        : '-'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="rounded-md border border-dashed p-8 text-center">
              <Webhook className="mx-auto h-8 w-8 text-muted-foreground/50" />
              <p className="mt-2 text-sm font-medium">No deliveries yet</p>
              <p className="text-xs text-muted-foreground">
                Send a test webhook or wait for external events
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
