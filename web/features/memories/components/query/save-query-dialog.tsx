'use client';

import { useState } from 'react';
import { Save, FileText } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { SavedQuery } from './types';

interface SaveQueryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (name: string, description: string) => void;
  existingQuery?: SavedQuery;
}

export function SaveQueryDialog({
  open,
  onOpenChange,
  onSave,
  existingQuery,
}: SaveQueryDialogProps) {
  const [name, setName] = useState(existingQuery?.name || '');
  const [description, setDescription] = useState(existingQuery?.description || '');

  const handleSave = () => {
    if (name.trim()) {
      onSave(name.trim(), description.trim());
      onOpenChange(false);
      if (!existingQuery) {
        setName('');
        setDescription('');
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Save className="h-5 w-5" />
            {existingQuery ? 'Update Query' : 'Save Query'}
          </DialogTitle>
          <DialogDescription>
            {existingQuery
              ? 'Update your saved query'
              : 'Save this query for later use'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="name">Query Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Recent High-Priority Memories"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">
              Description <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of what this query does..."
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!name.trim()}>
            <Save className="h-4 w-4 mr-2" />
            {existingQuery ? 'Update' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
