'use client';

import { cn } from '@/shared/lib/utils';
import { Button } from '@/components/ui/button';

interface MemoryCategory {
  id: string;
  label: string;
  color?: string;
}

interface MemoryFiltersProps {
  categories: MemoryCategory[];
  selectedCategory: string;
  onSelectCategory: (category: string) => void;
}

export function MemoryFilters({
  categories,
  selectedCategory,
  onSelectCategory,
}: MemoryFiltersProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {categories.map((category) => (
        <Button
          key={category.id}
          variant={selectedCategory === category.id ? 'default' : 'outline'}
          size="sm"
          onClick={() => onSelectCategory(category.id)}
          className={cn(
            'text-xs h-7',
            selectedCategory === category.id && category.color
          )}
        >
          {category.label}
        </Button>
      ))}
    </div>
  );
}
