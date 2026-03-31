'use client';

import { useTheme } from 'next-themes';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Sun, Moon, Monitor } from 'lucide-react';
import { cn } from '@/shared/lib/utils';

export function AppearancePage() {
  const { theme, setTheme } = useTheme();

  const themes = [
    { id: 'light', label: 'Light', icon: Sun, description: 'Light background with dark text' },
    { id: 'dark', label: 'Dark', icon: Moon, description: 'Dark background with light text' },
    { id: 'system', label: 'System', icon: Monitor, description: 'Follow your system preference' },
  ];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Theme</CardTitle>
          <CardDescription>Choose between light, dark, or system preference</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            {themes.map(({ id, label, icon: Icon, description }) => (
              <button
                key={id}
                onClick={() => setTheme(id)}
                className={cn(
                  "flex flex-col items-center gap-2 rounded-lg border-2 p-4 transition-colors hover:bg-accent",
                  theme === id ? "border-primary bg-accent" : "border-transparent"
                )}
              >
                <Icon className="h-6 w-6" />
                <span className="text-sm font-medium">{label}</span>
                <span className="text-xs text-muted-foreground text-center">{description}</span>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
