"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Alert,
  AlertTitle,
  AlertDescription,
} from "@/components/ui/alert";
import { Copy, Check, AlertCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Agent, CloneAgentOptions, CloneAgentResult } from "../types";
import { cloneAgent, generateCloneName } from "../api/clone-api";

interface CloneOptionsFormProps {
  options: CloneAgentOptions;
  onChange: (options: CloneAgentOptions) => void;
  error?: string;
}

function CloneOptionsForm({ options, onChange, error }: CloneOptionsFormProps) {
  const toggleOption = (key: keyof CloneAgentOptions) => {
    onChange({ ...options, [key]: !options[key] });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center space-x-2">
        <input
          type="checkbox"
          id="cloneSettings"
          checked={options.cloneSettings}
          onChange={() => toggleOption("cloneSettings")}
          className="rounded border-gray-300"
        />
        <Label htmlFor="cloneSettings" className="text-sm font-normal cursor-pointer">
          Clone settings (model, provider, system prompt)
        </Label>
      </div>
      <div className="flex items-center space-x-2">
        <input
          type="checkbox"
          id="cloneFiles"
          checked={options.cloneFiles}
          onChange={() => toggleOption("cloneFiles")}
          className="rounded border-gray-300"
        />
        <Label htmlFor="cloneFiles" className="text-sm font-normal cursor-pointer">
          Clone files (SOUL.md, TOOLS.md, HEARTBEAT.md)
        </Label>
      </div>
      <div className="flex items-center space-x-2">
        <input
          type="checkbox"
          id="cloneMemories"
          checked={options.cloneMemories}
          onChange={() => toggleOption("cloneMemories")}
          className="rounded border-gray-300"
        />
        <Label htmlFor="cloneMemories" className="text-sm font-normal cursor-pointer">
          Clone memories (not supported by backend)
        </Label>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

interface CloneAgentDialogProps {
  agent: Agent | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingAgentNames: string[];
}

export function CloneAgentDialog({
  agent,
  open,
  onOpenChange,
  existingAgentNames,
}: CloneAgentDialogProps) {
  const queryClient = useQueryClient();
  const [isCloning, setIsCloning] = React.useState(false);
  const [cloneResult, setCloneResult] = React.useState<CloneAgentResult | null>(null);
  const [newName, setNewName] = React.useState("");
  const [nameError, setNameError] = React.useState<string | null>(null);
  const [options, setOptions] = React.useState<CloneAgentOptions>({
    cloneSettings: true,
    cloneFiles: true,
    cloneMemories: false,
  });

  // Generate default name when dialog opens
  React.useEffect(() => {
    if (open && agent) {
      const generatedName = generateCloneName(agent.name, existingAgentNames);
      setNewName(generatedName);
      setNameError(null);
      setCloneResult(null);
      setOptions({
        cloneSettings: true,
        cloneFiles: true,
        cloneMemories: false,
      });
    }
  }, [open, agent, existingAgentNames]);

  const validateName = (name: string): boolean => {
    if (!name.trim()) {
      setNameError("Agent name is required");
      return false;
    }
    if (existingAgentNames.includes(name.trim())) {
      setNameError("An agent with this name already exists");
      return false;
    }
    setNameError(null);
    return true;
  };

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setNewName(value);
    if (nameError) {
      validateName(value);
    }
  };

  const handleClone = async () => {
    if (!agent || !validateName(newName)) return;

    const hasSelection = options.cloneSettings || options.cloneFiles || options.cloneMemories;
    if (!hasSelection) {
      toast.error("Please select at least one option to clone");
      return;
    }

    setIsCloning(true);
    setCloneResult(null);

    try {
      const result = await cloneAgent(
        agent.id,
        {
          ...options,
          newName: newName.trim(),
        },
        existingAgentNames
      );

      setCloneResult(result);

      if (result.success) {
        toast.success(`Agent "${newName}" created successfully`);
        queryClient.invalidateQueries({ queryKey: ["agents"] });
      } else {
        toast.error("Failed to clone agent");
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      setCloneResult({
        success: false,
        clonedSettings: false,
        clonedFiles: false,
        clonedMemories: false,
        errors: [errorMessage],
      });
      toast.error(`Cloning failed: ${errorMessage}`);
    } finally {
      setIsCloning(false);
    }
  };

  const handleClose = () => {
    if (!isCloning) {
      onOpenChange(false);
      // Reset state after animation
      setTimeout(() => {
        setCloneResult(null);
        setNameError(null);
      }, 300);
    }
  };

  const hasSelection = options.cloneSettings || options.cloneFiles || options.cloneMemories;
  const canClone = newName.trim() && !nameError && hasSelection && !isCloning;

  if (!agent) return null;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Clone Agent</DialogTitle>
          <DialogDescription>
            Create a copy of <strong>{agent.name}</strong> with the selected options.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Success State */}
          {cloneResult?.success && (
            <Alert
              variant="default"
              className="border-green-200 bg-green-50 dark:bg-green-950/20 dark:border-green-900"
            >
              <Check className="h-4 w-4 text-green-600 dark:text-green-400" />
              <AlertTitle>Clone Successful</AlertTitle>
              <AlertDescription>
                Agent <strong>{newName}</strong> has been created successfully.
                {cloneResult.agentId && (
                  <div className="mt-2 text-xs text-muted-foreground">
                    ID: {cloneResult.agentId}
                  </div>
                )}
              </AlertDescription>
            </Alert>
          )}

          {/* Error State */}
          {cloneResult && !cloneResult.success && cloneResult.errors.length > 0 && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Clone Failed</AlertTitle>
              <AlertDescription>
                <ul className="list-disc pl-4 mt-1 space-y-1">
                  {cloneResult.errors.map((error, index) => (
                    <li key={index}>{error}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          {/* Name Input */}
          <div className="space-y-2">
            <Label htmlFor="clone-name">New Agent Name</Label>
            <div className="relative">
              <Input
                id="clone-name"
                value={newName}
                onChange={handleNameChange}
                placeholder="Enter agent name"
                disabled={isCloning || cloneResult?.success}
                className={nameError ? "border-destructive" : ""}
              />
              <Copy className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            </div>
            {nameError && (
              <p className="text-sm text-destructive">{nameError}</p>
            )}
          </div>

          {/* Clone Options */}
          <CloneOptionsForm
            options={options}
            onChange={setOptions}
            error={!hasSelection ? "Please select at least one option" : undefined}
          />
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={isCloning}
          >
            {cloneResult?.success ? "Close" : "Cancel"}
          </Button>
          {!cloneResult?.success && (
            <Button
              onClick={handleClone}
              disabled={!canClone}
            >
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
          )}
          {cloneResult?.success && (
            <Button
              onClick={() => {
                setCloneResult(null);
                setNewName(generateCloneName(agent.name, [...existingAgentNames, newName]));
              }}
            >
              <Copy className="mr-2 h-4 w-4" />
              Clone Again
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
