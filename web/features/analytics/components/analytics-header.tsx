'use client';

import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Download } from 'lucide-react';
import { toast } from 'sonner';
import { TimeRange } from '../types';

interface AnalyticsHeaderProps {
  timeRange: TimeRange;
  onTimeRangeChange: (value: TimeRange) => void;
}

export function AnalyticsHeader({ timeRange, onTimeRangeChange }: AnalyticsHeaderProps) {
  const handleExport = () => {
    toast.success('Analytics data exported successfully');
  };

  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold">Analytics</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Monitor agent usage, performance, and costs
        </p>
      </div>
      <div className="flex flex-col sm:flex-row gap-2">
        <Select
          value={timeRange}
          onValueChange={(value) => onTimeRangeChange(value as TimeRange)}
        >
          <SelectTrigger className="w-[160px] sm:w-[180px]">
            <SelectValue placeholder="Select time range" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="24h">Last 24 Hours</SelectItem>
            <SelectItem value="7d">Last 7 Days</SelectItem>
            <SelectItem value="30d">Last 30 Days</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" onClick={handleExport} className="gap-2">
          <Download className="h-4 w-4" />
          Export
        </Button>
      </div>
    </div>
  );
}
