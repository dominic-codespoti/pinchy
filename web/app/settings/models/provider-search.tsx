'use client';

import * as React from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';

interface ProviderSearchProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export function ProviderSearch({ value, onChange, placeholder }: ProviderSearchProps) {
  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
      <Input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder || 'Search providers...'}
        className="pl-9"
      />
    </div>
  );
}
