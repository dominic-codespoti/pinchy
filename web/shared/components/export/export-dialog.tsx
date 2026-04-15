'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Download } from 'lucide-react';
import type { ExportFormat, DateRange } from '@/shared/lib/export';

interface ExportDialogProps {
  entity: string;
  entityName: string;
  onExport: (format: ExportFormat, dateRange: DateRange, includeMessages?: boolean) => void;
  allowMessageExport?: boolean;
}

export function ExportDialog({ entity, entityName, onExport, allowMessageExport }: ExportDialogProps) {
  const [open, setOpen] = useState(false);
  const [format, setFormat] = useState<ExportFormat>('csv');
  const [includeMessages, setIncludeMessages] = useState(false);

  const handleExport = () => {
    const dateRange: DateRange = {};
    onExport(format, dateRange, allowMessageExport ? includeMessages : undefined);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Download className="h-4 w-4 mr-2" />
          Export {entityName}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Export {entityName}</DialogTitle>
          <DialogDescription>
            Download {entityName.toLowerCase()} data in your preferred format.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label>Format</Label>
            <Select value={format} onValueChange={(v) => setFormat(v as ExportFormat)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="csv">CSV</SelectItem>
                <SelectItem value="json">JSON</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {allowMessageExport && (
            <div className="flex items-center space-x-2">
              <Checkbox
                id="includeMessages"
                checked={includeMessages}
                onCheckedChange={(checked) => setIncludeMessages(checked === true)}
              />
              <Label htmlFor="includeMessages">Include messages</Label>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={handleExport}>Export</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
