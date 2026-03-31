'use client';

import { Palette } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface ThemePageProps {
  children?: React.ReactNode;
}

export function ThemePage({ children }: ThemePageProps) {
  return (
    <>
      {/* Header */}
      <div className="flex items-center gap-3">
        <Palette className="h-6 w-6 text-muted-foreground" />
        <div>
          <h1 className="text-xl font-bold">Theme</h1>
          <p className="text-sm text-muted-foreground">Customize themes and colors</p>
        </div>
      </div>

      {/* Theme Selection */}
      <Card>
        <CardHeader>
          <CardTitle>Theme</CardTitle>
          <CardDescription>Choose between light, dark, or system preference</CardDescription>
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
    </>
  );
}
