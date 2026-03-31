'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Activity, CheckCircle } from 'lucide-react';
import { useState } from 'react';
import { useSetLogLevel } from '../hooks';
import { logLevelOptions } from '../utils';
import { LogLevel } from '../types';

const services = [
  { name: 'Application', status: 'Active' },
  { name: 'Database', status: 'Active' },
  { name: 'API Gateway', status: 'Active' },
  { name: 'Scheduler', status: 'Active' },
];

export function LogsTab() {
  const [logLevel, setLogLevel] = useState<LogLevel>('info');
  const setLogLevelMutation = useSetLogLevel();

  const handleLogLevelChange = (value: LogLevel) => {
    setLogLevel(value);
    setLogLevelMutation.mutate(value);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base sm:text-lg flex items-center gap-2">
          <Activity className="h-5 w-5" />
          Log Level Configuration
        </CardTitle>
        <CardDescription>Control the verbosity of system logging</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="log-level">Log Level</Label>
          <Select value={logLevel} onValueChange={(v) => handleLogLevelChange(v as LogLevel)}>
            <SelectTrigger id="log-level" className="w-[200px]">
              <SelectValue placeholder="Select log level" />
            </SelectTrigger>
            <SelectContent>
              {logLevelOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${option.color}`} />
                    {option.label}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {services.map((service) => (
            <div key={service.name} className="flex items-center gap-2 p-3 border rounded-lg">
              <CheckCircle className="h-4 w-4 text-green-500" />
              <div>
                <p className="text-sm font-medium">{service.name}</p>
                <p className="text-xs text-muted-foreground">{service.status}</p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
