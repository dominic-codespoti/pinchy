'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Check, Bell, Settings, User } from 'lucide-react';

interface ThemePreviewProps {
  className?: string;
}

export function ThemePreview({ className }: ThemePreviewProps) {
  return (
    <div className={className}>
      <h3 className="text-sm font-medium mb-4 text-muted-foreground">Preview</h3>
      
      <div className="space-y-4">
        {/* Buttons Preview */}
        <div className="flex flex-wrap gap-2">
          <Button>Primary Button</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="destructive">Destructive</Button>
        </div>

        {/* Card Preview */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Sample Card</CardTitle>
              <Badge>Default</Badge>
            </div>
            <CardDescription>
              This shows how cards appear with your theme
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="preview-input">Input Field</Label>
              <Input id="preview-input" placeholder="Type something..." />
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center space-x-2">
                <Switch id="preview-switch" />
                <Label htmlFor="preview-switch">Toggle</Label>
              </div>
              <div className="flex items-center gap-2">
                <Check className="h-4 w-4 text-primary" />
                <span className="text-sm">Success state</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Text & Icons Preview */}
        <Card>
          <CardContent className="pt-6 space-y-3">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-md bg-primary/10">
                <User className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="font-medium">User Profile</p>
                <p className="text-sm text-muted-foreground">View and edit your profile</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-md bg-secondary">
                <Bell className="h-4 w-4" />
              </div>
              <div>
                <p className="font-medium">Notifications</p>
                <p className="text-sm text-muted-foreground">Manage your alerts</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-md bg-accent">
                <Settings className="h-4 w-4" />
              </div>
              <div>
                <p className="font-medium">Settings</p>
                <p className="text-sm text-muted-foreground">Configure preferences</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Color Palette Preview */}
        <div className="grid grid-cols-4 gap-2">
          <div className="space-y-1">
            <div className="h-12 rounded-md bg-primary" />
            <p className="text-xs text-center text-muted-foreground">Primary</p>
          </div>
          <div className="space-y-1">
            <div className="h-12 rounded-md bg-secondary" />
            <p className="text-xs text-center text-muted-foreground">Secondary</p>
          </div>
          <div className="space-y-1">
            <div className="h-12 rounded-md bg-accent" />
            <p className="text-xs text-center text-muted-foreground">Accent</p>
          </div>
          <div className="space-y-1">
            <div className="h-12 rounded-md bg-muted" />
            <p className="text-xs text-center text-muted-foreground">Muted</p>
          </div>
        </div>
      </div>
    </div>
  );
}
