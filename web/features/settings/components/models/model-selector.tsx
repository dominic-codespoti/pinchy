'use client';

import * as React from 'react';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/shared/lib/utils';
import { ModelInfo } from '../../types';
import { getProviderBadgeColor } from './provider-constants';

interface ModelSelectorProps {
  value: string;
  onChange: (model: ModelInfo) => void;
  models: ModelInfo[];
}

export function ModelSelector({ value, onChange, models }: ModelSelectorProps) {
  const [open, setOpen] = React.useState(false);

  const selectedModel = models.find((m) => m.id === value);

  // Group models by provider
  const groupedModels = React.useMemo(() => {
    const groups: Record<string, ModelInfo[]> = {};
    for (const model of models) {
      const provider = model.provider || 'Other';
      if (!groups[provider]) {
        groups[provider] = [];
      }
      groups[provider].push(model);
    }
    return groups;
  }, [models]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between"
        >
          {selectedModel ? (
            <div className="flex items-center gap-2 overflow-hidden">
              <span
                className={cn(
                  'h-2 w-2 rounded-full shrink-0',
                  getProviderBadgeColor(selectedModel.provider)
                )}
              />
              <span className="truncate">{selectedModel.name}</span>
            </div>
          ) : (
            'Select a model...'
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
        <Command>
          <CommandInput placeholder="Search models..." />
          <CommandList>
            <CommandEmpty>No model found.</CommandEmpty>
            {Object.entries(groupedModels).map(([provider, providerModels]) => (
              <CommandGroup key={provider} heading={provider}>
                {providerModels.map((model) => (
                  <CommandItem
                    key={model.id}
                    value={model.id}
                    onSelect={() => {
                      onChange(model);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        'mr-2 h-4 w-4',
                        value === model.id ? 'opacity-100' : 'opacity-0'
                      )}
                    />
                    <div className="flex flex-col">
                      <span>{model.name}</span>
                      {model.description && (
                        <span className="text-xs text-muted-foreground">{model.description}</span>
                      )}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
