"use client";

import { useState } from "react";
import { Agent } from "../types";

interface DeleteDialogState {
  open: boolean;
  agentId: string;
  agentName: string;
}

interface CloneDialogState {
  open: boolean;
  agent: Agent | null;
}

export function useAgentDialogs() {
  const [deleteDialog, setDeleteDialog] = useState<DeleteDialogState>({
    open: false,
    agentId: "",
    agentName: "",
  });

  const [bulkDeleteDialog, setBulkDeleteDialog] = useState(false);

  const [cloneDialog, setCloneDialog] = useState<CloneDialogState>({
    open: false,
    agent: null,
  });

  const [assignDialogOpen, setAssignDialogOpen] = useState(false);

  return {
    deleteDialog,
    setDeleteDialog,
    bulkDeleteDialog,
    setBulkDeleteDialog,
    cloneDialog,
    setCloneDialog,
    assignDialogOpen,
    setAssignDialogOpen,
  };
}
