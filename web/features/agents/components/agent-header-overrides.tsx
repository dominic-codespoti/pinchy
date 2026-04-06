'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, Trash2 } from 'lucide-react';
import type { AgentHeaderOverride } from '../types';

export interface AgentHeaderOverridesProps {
  value: AgentHeaderOverride[];
  onChange: (next: AgentHeaderOverride[]) => void;
  disabled?: boolean;
}

const EMPTY_ROW: AgentHeaderOverride = { header: '', value: '' };

export function normalizeHeaderOverrides(rows: AgentHeaderOverride[]): AgentHeaderOverride[] {
  return rows
    .map((row) => ({
      header: row.header.trim(),
      value: row.value.trim(),
    }))
    .filter((row) => row.header !== '' || row.value !== '');
}

export function AgentHeaderOverrides({ value, onChange, disabled }: AgentHeaderOverridesProps) {
  const rows = value.length ? value : [EMPTY_ROW];

  const updateRow = (index: number, patch: Partial<AgentHeaderOverride>) => {
    onChange(
      rows.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row))
    );
  };

  const addRow = () => onChange([...rows, { ...EMPTY_ROW }]);

  const removeRow = (index: number) => {
    const next = rows.filter((_, rowIndex) => rowIndex !== index);
    onChange(next);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-1">
          <Label>Header overrides</Label>
          <p className="text-xs text-muted-foreground">
            Add per-agent HTTP header overrides for this model.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={addRow} disabled={disabled}>
          <Plus className="mr-2 h-4 w-4" />
          Add row
        </Button>
      </div>

      <div className="space-y-3">
        {rows.map((row, index) => (
          <div key={index} className="grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
            <div className="space-y-2">
              <Label htmlFor={`header-override-header-${index}`}>Header</Label>
              <Input
                id={`header-override-header-${index}`}
                value={row.header}
                onChange={(event) => updateRow(index, { header: event.target.value })}
                placeholder="Authorization"
                disabled={disabled}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`header-override-value-${index}`}>Value</Label>
              <Input
                id={`header-override-value-${index}`}
                value={row.value}
                onChange={(event) => updateRow(index, { value: event.target.value })}
                placeholder="Bearer token"
                disabled={disabled}
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => removeRow(index)}
              disabled={disabled}
              aria-label={`Remove header override row ${index + 1}`}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
