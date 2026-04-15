'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Loader2, Copy, Bot, CheckCircle } from 'lucide-react';
import { Agent } from '../types';

interface CloneAgentDialogProps {
  sourceAgent: Agent;
  onClone?: (
    sourceId: string,
    newId: string,
    options: {
      cloneSettings: boolean;
      cloneFiles: boolean;
      cloneMemories: boolean;
    }
  ) => Promise<void>;
  trigger?: React.ReactNode;
}

export function CloneAgentDialog({ sourceAgent, onClone, trigger }: CloneAgentDialogProps) {
  const [open, setOpen] = useState(false);
  const [isCloning, setIsCloning] = useState(false);
  const [newId, setNewId] = useState(`${sourceAgent.id}-copy`);
  const [options, setOptions] = useState({
    cloneSettings: true,
    cloneFiles: true,
    cloneMemories: false,
  });
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!newId.trim()) {
      setError('New agent ID is required');
      return;
    }

    if (!/^[a-z0-9_-]+$/.test(newId)) {
      setError('Agent ID can only contain lowercase letters, numbers, underscores, and hyphens');
      return;
    }

    if (newId === sourceAgent.id) {
      setError('New agent ID must be different from the source agent');
      return;
    }

    setIsCloning(true);
    try {
      await onClone?.(sourceAgent.id, newId, options);
      setOpen(false);
      setNewId(`${sourceAgent.id}-copy`);
      setOptions({ cloneSettings: true, cloneFiles: true, cloneMemories: false });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clone agent');
    } finally {
      setIsCloning(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm">
            <Copy className="mr-2 h-4 w-4" />
            Clone
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Clone Agent</DialogTitle>
            <DialogDescription>
              Create a copy of an existing agent with selected options.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-6 py-4">
            <div className="rounded-lg border bg-muted/50 p-4">
              <p className="text-sm font-medium text-muted-foreground mb-2">Source Agent</p>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <Bot className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium">{sourceAgent.name}</p>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span>{sourceAgent.id}</span>
                    <Badge variant="outline" className="text-xs">
                      {sourceAgent.config.provider}
                    </Badge>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="new-agent-id">
                New Agent ID <span className="text-destructive">*</span>
              </Label>
              <Input
                id="new-agent-id"
                placeholder="e.g., agent-copy, agent-v2"
                value={newId}
                onChange={(e) => setNewId(e.target.value)}
                disabled={isCloning}
              />
              <p className="text-xs text-muted-foreground">
                Unique identifier for the cloned agent.
              </p>
            </div>

            <div className="space-y-3">
              <p className="text-sm font-medium">Clone Options</p>
              
              <div className="flex items-start gap-3">
                <Checkbox
                  id="clone-settings"
                  checked={options.cloneSettings}
                  onCheckedChange={(checked) =>
                    setOptions((prev) => ({ ...prev, cloneSettings: checked === true }))
                  }
                  disabled={isCloning}
                />
                <div className="grid gap-1.5 leading-none">
                  <Label
                    htmlFor="clone-settings"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    Settings & Configuration
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Copy model, provider, heartbeat, and execution settings
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Checkbox
                  id="clone-files"
                  checked={options.cloneFiles}
                  onCheckedChange={(checked) =>
                    setOptions((prev) => ({ ...prev, cloneFiles: checked === true }))
                  }
                  disabled={isCloning}
                />
                <div className="grid gap-1.5 leading-none">
                  <Label
                    htmlFor="clone-files"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    Configuration Files
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Copy SOUL.md, TOOLS.md, and HEARTBEAT.md files
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Checkbox
                  id="clone-memories"
                  checked={options.cloneMemories}
                  onCheckedChange={(checked) =>
                    setOptions((prev) => ({ ...prev, cloneMemories: checked === true }))
                  }
                  disabled={isCloning}
                />
                <div className="grid gap-1.5 leading-none">
                  <Label
                    htmlFor="clone-memories"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    Memories & Knowledge
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Copy all stored memories and learned knowledge
                  </p>
                </div>
              </div>
            </div>

            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isCloning}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isCloning}>
              {isCloning ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Cloning...
                </>
              ) : (
                <>
                  <Copy className="mr-2 h-4 w-4" />
                  Clone Agent
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
