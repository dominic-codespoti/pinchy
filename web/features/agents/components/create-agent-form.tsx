"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface CreateAgentFormProps {
  onClose: () => void;
  onCreate: (id: string, model: string) => void;
  isPending: boolean;
}

CreateAgentForm.displayName = "CreateAgentForm";

export function CreateAgentForm({ onClose, onCreate, isPending }: CreateAgentFormProps) {
  const [agentId, setAgentId] = useState("");
  const [model, setModel] = useState("");

  const handleSubmit = () => {
    if (!agentId.trim()) return;
    onCreate(agentId, model);
  };

  return (
    <div className="grid gap-4 py-4">
      <div className="grid gap-2">
        <Label htmlFor="agentId">Agent ID</Label>
        <Input
          id="agentId"
          value={agentId}
          onChange={(e) => setAgentId(e.target.value)}
          placeholder="e.g., my-agent-1"
        />
        <p className="text-xs text-muted-foreground">
          Use alphanumeric characters, hyphens, and underscores only.
        </p>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="model">Model (optional)</Label>
        <Select value={model} onValueChange={setModel}>
          <SelectTrigger id="model">
            <SelectValue placeholder="Select a model" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="gpt-4">GPT-4</SelectItem>
            <SelectItem value="gpt-4-turbo">GPT-4 Turbo</SelectItem>
            <SelectItem value="claude-3-5-sonnet">Claude 3.5 Sonnet</SelectItem>
            <SelectItem value="claude-3-opus">Claude 3 Opus</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col-reverse sm:flex-row justify-end gap-2">
        <Button variant="outline" onClick={onClose} className="w-full sm:w-auto">
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={!agentId.trim() || isPending}
          className="w-full sm:w-auto"
        >
          {isPending ? "Creating..." : "Create Agent"}
        </Button>
      </div>
    </div>
  );
}
