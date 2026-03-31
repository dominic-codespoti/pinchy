import { Agent, CreateAgentInput, UpdateAgentInput } from '@/features/agents/types';
import { getAgent, createAgent, updateAgent } from '@/features/agents/api/agents-api';
import { getAgentMemories, addMemory } from '@/features/agents/api/memory-api';
import { getAgentFiles, uploadAgentFile, getAgentFileContent } from '@/features/agents/api/files-api';

export interface CloneAgentOptions {
  cloneSettings: boolean;
  cloneFiles: boolean;
  cloneMemories: boolean;
  newName: string;
}

export interface CloneAgentResult {
  success: boolean;
  agentId?: string;
  clonedSettings: boolean;
  clonedFiles: boolean;
  clonedMemories: boolean;
  errors: string[];
}

/**
 * Generate a unique name for the cloned agent
 * Detects existing suffix patterns and increments them
 */
export function generateCloneName(originalName: string, existingNames: string[]): string {
  // Check for existing -copy, -copy-1, -copy-2 patterns
  const copyPattern = /-copy(?:-(\d+))?$/;
  const match = originalName.match(copyPattern);

  let baseName: string;
  let nextNumber: number;

  if (match) {
    // Already has a copy suffix, extract base and increment
    baseName = originalName.replace(copyPattern, '');
    const currentNumber = match[1] ? parseInt(match[1], 10) : 0;
    nextNumber = currentNumber + 1;
  } else {
    // No copy suffix, start fresh
    baseName = originalName;
    nextNumber = 0;
  }

  // Generate candidate names until we find a unique one
  let candidateName: string;
  let attempts = 0;
  const maxAttempts = 100;

  do {
    if (nextNumber === 0) {
      candidateName = `${baseName}-copy`;
    } else {
      candidateName = `${baseName}-copy-${nextNumber}`;
    }
    nextNumber++;
    attempts++;
  } while (existingNames.includes(candidateName) && attempts < maxAttempts);

  // Fallback if all suffixes are taken
  if (existingNames.includes(candidateName)) {
    const timestamp = Date.now();
    candidateName = `${baseName}-copy-${timestamp}`;
  }

  return candidateName;
}

/**
 * Clone an agent with the specified options
 */
export async function cloneAgent(
  sourceId: string,
  options: CloneAgentOptions,
  existingAgentNames: string[]
): Promise<CloneAgentResult> {
  const errors: string[] = [];
  const result: CloneAgentResult = {
    success: false,
    clonedSettings: false,
    clonedFiles: false,
    clonedMemories: false,
    errors,
  };

  try {
    // Fetch source agent data
    let sourceAgent: Agent;
    try {
      sourceAgent = await getAgent(sourceId);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      errors.push(`Failed to fetch source agent: ${errorMessage}`);
      return result;
    }

    // Generate name if not provided
    const newName = options.newName || generateCloneName(sourceAgent.name, existingAgentNames);

    // Prepare create input
    const createInput: CreateAgentInput = {
      id: newName,
      model: options.cloneSettings ? sourceAgent.config.model : undefined,
      soul: options.cloneSettings ? sourceAgent.config.systemPrompt : undefined,
      tools: options.cloneSettings && sourceAgent.config.toolsEnabled?.length
        ? JSON.stringify(sourceAgent.config.toolsEnabled)
        : undefined,
      heartbeat_secs: options.cloneSettings ? sourceAgent.heartbeatInterval : undefined,
    };

    // Create the new agent
    let newAgent: Agent;
    try {
      newAgent = await createAgent(createInput);
      result.agentId = newAgent.id;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      errors.push(`Failed to create agent: ${errorMessage}`);
      return result;
    }

    // Clone settings if enabled
    if (options.cloneSettings) {
      try {
        const updateData: UpdateAgentInput = {};

        // Additional settings that may need to be copied
        // Note: These would need to be fetched from detailed agent endpoint
        // which might include more fields than the basic getAgent

        if (Object.keys(updateData).length > 0) {
          await updateAgent(newAgent.id, updateData);
        }

        result.clonedSettings = true;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        errors.push(`Failed to clone settings: ${errorMessage}`);
      }
    }

    // Clone files if enabled
    if (options.cloneFiles) {
      try {
        const files = await getAgentFiles(sourceId);

        for (const file of files) {
          if (file.isDirectory) continue;

          try {
            // Fetch file content
            const content = await getAgentFileContent(sourceId, file.name);

            // Create a File object from the content
            const blob = new Blob([content], { type: 'text/plain' });
            const newFile = new File([blob], file.name, { type: 'text/plain' });

            // Upload to new agent
            await uploadAgentFile(newAgent.id, newFile);
          } catch (fileError) {
            const fileErrorMessage = fileError instanceof Error ? fileError.message : 'Unknown error';
            errors.push(`Failed to clone file "${file.name}": ${fileErrorMessage}`);
            // Continue with other files - don't fail entire clone
          }
        }

        result.clonedFiles = true;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        errors.push(`Failed to clone files: ${errorMessage}`);
      }
    }

    // Clone memories if enabled
    if (options.cloneMemories) {
      try {
        const memories = await getAgentMemories(sourceId);

        // Memories can only be added via tool calls, not API
        // Mark as not cloned since we can't actually clone them
        result.clonedMemories = false;
        if (memories.length > 0) {
          errors.push('Memory cloning not supported: memories can only be added via tool calls');
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        errors.push(`Failed to clone memories: ${errorMessage}`);
      }
    }

    result.success = true;
  } catch (error) {
    errors.push(`Unexpected error: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }

  return result;
}

/**
 * Preview what will be cloned
 */
export async function getClonePreview(
  sourceId: string,
  options: CloneAgentOptions
): Promise<{
  settings: { model?: string; provider?: string; systemPrompt?: string; toolsCount: number } | null;
  files: { count: number; names: string[] };
  memories: { count: number };
}> {
  const preview = {
    settings: null as { model?: string; provider?: string; systemPrompt?: string; toolsCount: number } | null,
    files: { count: 0, names: [] as string[] },
    memories: { count: 0 },
  };

  try {
    const sourceAgent = await getAgent(sourceId);

    if (options.cloneSettings) {
      preview.settings = {
        model: sourceAgent.config.model,
        provider: sourceAgent.config.provider,
        systemPrompt: sourceAgent.config.systemPrompt,
        toolsCount: sourceAgent.config.toolsEnabled?.length || 0,
      };
    }

    if (options.cloneFiles) {
      const files = await getAgentFiles(sourceId);
      preview.files = {
        count: files.length,
        names: files.filter(f => !f.isDirectory).slice(0, 5).map(f => f.name),
      };
    }

    if (options.cloneMemories) {
      const memories = await getAgentMemories(sourceId);
      preview.memories = {
        count: memories.length,
      };
    }
  } catch {
    // Preview is best-effort, ignore errors
  }

  return preview;
}
