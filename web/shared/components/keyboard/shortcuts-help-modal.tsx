'use client';

import { useState, useMemo } from 'react';
import { Search, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Kbd, KbdCombo } from './kbd';
import { 
  SHORTCUTS, 
  formatShortcut, 
  CATEGORY_LABELS,
  type Shortcut 
} from '@/shared/lib/shortcuts';

interface ShortcutsHelpModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isMac?: boolean;
}

export function ShortcutsHelpModal({ 
  open, 
  onOpenChange,
  isMac = false 
}: ShortcutsHelpModalProps) {
  const [search, setSearch] = useState('');

  const filteredShortcuts = useMemo(() => {
    if (!search.trim()) return SHORTCUTS;
    
    const query = search.toLowerCase();
    return SHORTCUTS.filter(
      s => 
        s.description.toLowerCase().includes(query) ||
        s.id.toLowerCase().includes(query) ||
        s.key.toLowerCase().includes(query) ||
        CATEGORY_LABELS[s.category].toLowerCase().includes(query)
    );
  }, [search]);

  const categories = useMemo(() => {
    const cats: Shortcut['category'][] = ['navigation', 'agents', 'general', 'view'];
    return cats.filter(cat => 
      filteredShortcuts.some(s => s.category === cat)
    );
  }, [filteredShortcuts]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <DialogTitle className="flex items-center gap-2">
            <KbdCombo keys={[isMac ? '⌘' : 'Ctrl', '/']} size="sm" />
            <span>Keyboard Shortcuts</span>
          </DialogTitle>
        </DialogHeader>
        
        <div className="px-6 py-4 border-b">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search shortcuts..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 pr-9"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        <ScrollArea className="max-h-[50vh]">
          <div className="p-6 space-y-6">
            {categories.map((category) => (
              <div key={category}>
                <h3 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wider">
                  {CATEGORY_LABELS[category]}
                </h3>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[200px]">Shortcut</TableHead>
                      <TableHead>Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredShortcuts
                      .filter(s => s.category === category)
                      .map((shortcut) => {
                        const formatted = formatShortcut(shortcut, isMac);
                        const keys = formatted.split(' ');
                        
                        return (
                          <TableRow key={shortcut.id}>
                            <TableCell className="font-mono">
                              <KbdCombo 
                                keys={keys} 
                                size="sm" 
                                variant="outline"
                              />
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <span className="text-sm">{shortcut.description}</span>
                                {shortcut.id.startsWith('navigate-agent') && (
                                  <Badge variant="secondary" className="text-xs">
                                    Agent
                                  </Badge>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                  </TableBody>
                </Table>
              </div>
            ))}
            
            {filteredShortcuts.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <p>No shortcuts found matching &quot;{search}&quot;</p>
              </div>
            )}
          </div>
        </ScrollArea>

        <div className="px-6 py-3 border-t bg-muted/50">
          <p className="text-xs text-muted-foreground">
            Press <Kbd size="sm" variant="ghost">Esc</Kbd> to close this dialog
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
