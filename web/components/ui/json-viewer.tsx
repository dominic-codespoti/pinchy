'use client';

import { useState, useCallback, useMemo } from 'react';
import { Copy, Check, ChevronRight, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/shared/lib/utils';

interface JsonViewerProps {
  data: unknown;
  maxHeight?: number;
  showCopyButton?: boolean;
  defaultExpanded?: boolean;  // NEW
  truncateStrings?: boolean;  // NEW - defaults to true
  className?: string;
}

type JsonValue =
  | { type: 'object'; value: Record<string, unknown>; keys: string[] }
  | { type: 'array'; value: unknown[]; length: number }
  | { type: 'string'; value: string }
  | { type: 'number'; value: number }
  | { type: 'boolean'; value: boolean }
  | { type: 'null' }
  | { type: 'undefined' }
  | { type: 'unknown'; value: unknown };

interface ClosingBracketValue {
  type: 'bracket';
  value: '}' | ']';
}

type TreeValue = JsonValue | ClosingBracketValue;

interface TreeNode {
  key: string;
  path: string;
  value: TreeValue;
  depth: number;
}

const STRING_PREVIEW_LENGTH = 50;
const ARRAY_PREVIEW_ITEMS = 3;
const OBJECT_PREVIEW_KEYS = 2;

const colors = {
  key: 'text-slate-400',
  string: 'text-emerald-400',
  number: 'text-amber-400',
  boolean: 'text-purple-400',
  null: 'text-purple-400',
  undefined: 'text-gray-500',
  bracket: 'text-muted-foreground',
  colon: 'text-muted-foreground',
};

function parseJsonValue(data: unknown): JsonValue {
  if (data === null) return { type: 'null' };
  if (data === undefined) return { type: 'undefined' };

  const t = typeof data;

  if (t === 'string') {
    return { type: 'string', value: data as string };
  }
  if (t === 'number') {
    return { type: 'number', value: data as number };
  }
  if (t === 'boolean') {
    return { type: 'boolean', value: data as boolean };
  }

  if (Array.isArray(data)) {
    return { type: 'array', value: data, length: data.length };
  }

  if (t === 'object') {
    const obj = data as Record<string, unknown>;
    return { type: 'object', value: obj, keys: Object.keys(obj) };
  }

  return { type: 'unknown', value: data };
}

function parseJsonRobust(data: unknown): JsonValue {
  // If already an object/array, parse it directly
  if (typeof data === 'object') {
    return parseJsonValue(data);
  }

  // If it's a string, try to parse as JSON
  if (typeof data === 'string') {
    const trimmed = data.trim();

    // Try direct JSON parse
    try {
      const parsed = JSON.parse(trimmed);
      return parseJsonValue(parsed);
    } catch {
      // Continue to next strategy
    }

    // Try unescaping and parsing
    if (trimmed.includes('\\')) {
      try {
        const unescaped = trimmed
          .replace(/\\n/g, '\n')
          .replace(/\\t/g, '\t')
          .replace(/\\"/g, '"')
          .replace(/\\\\/g, '\\');
        const parsed = JSON.parse(unescaped);
        return parseJsonValue(parsed);
      } catch {
        // Continue to return as raw string
      }
    }

    // Return as raw string if not valid JSON
    return { type: 'string', value: data };
  }

  // For other primitives
  return parseJsonValue(data);
}

function getCollapsedPreview(node: TreeNode, truncateStrings: boolean = true): string {
  const { value } = node;

  switch (value.type) {
    case 'object': {
      const keys = value.keys;
      if (keys.length === 0) return '{}';
      if (keys.length <= OBJECT_PREVIEW_KEYS) {
        const preview = keys.join(', ');
        return `{${preview}}`;
      }
      return `{${keys.slice(0, OBJECT_PREVIEW_KEYS).join(', ')}, ...}`;
    }
    case 'array': {
      if (value.length === 0) return '[]';
      const preview: string[] = [];
      for (let i = 0; i < Math.min(value.length, ARRAY_PREVIEW_ITEMS); i++) {
        const item = value.value[i];
        if (typeof item === 'string') {
          if (truncateStrings) {
            const truncated = item.length > 20 ? `"${item.slice(0, 20)}..."` : `"${item}"`;
            preview.push(truncated);
          } else {
            preview.push(`"${item}"`);
          }
        } else if (typeof item === 'number') {
          preview.push(String(item));
        } else if (typeof item === 'boolean') {
          preview.push(String(item));
        } else if (item === null) {
          preview.push('null');
        } else if (Array.isArray(item)) {
          preview.push(`[${item.length} items]`);
        } else if (typeof item === 'object') {
          const keys = Object.keys(item as object);
          preview.push(`{${keys.length} keys}`);
        } else {
          preview.push(String(item));
        }
      }
      if (value.length > ARRAY_PREVIEW_ITEMS) {
        preview.push('...');
      }
      return `[${preview.join(', ')}]`;
    }
    case 'string': {
      const str = value.value;
      if (truncateStrings && str.length > STRING_PREVIEW_LENGTH) {
        return `"[${str.length} chars]"`;
      }
      return `"${str}"`;
    }
    case 'number':
      return String(value.value);
    case 'boolean':
      return String(value.value);
    case 'null':
      return 'null';
    case 'undefined':
      return 'undefined';
    case 'unknown':
      return String(value.value);
    case 'bracket':
      return value.value;
  }
}

function getValueColor(type: TreeValue['type']): string {
  switch (type) {
    case 'string':
      return colors.string;
    case 'number':
      return colors.number;
    case 'boolean':
      return colors.boolean;
    case 'null':
      return colors.null;
    case 'undefined':
      return colors.undefined;
    default:
      return 'text-foreground';
  }
}

interface TreeRowProps {
  node: TreeNode;
  isExpanded: boolean;
  onToggle: (path: string) => void;
  allExpanded: Set<string>;
  truncateStrings?: boolean;
}

function TreeRow({ node, isExpanded, onToggle, allExpanded, truncateStrings }: TreeRowProps) {
  const { key, path, value, depth } = node;
  const hasChildren = value.type === 'object' || value.type === 'array';
  const indent = depth * 16; // 16px per level

  const handleToggle = useCallback(() => {
    if (hasChildren) {
      onToggle(path);
    }
  }, [hasChildren, path, onToggle]);

  const preview = useMemo(() => getCollapsedPreview(node, truncateStrings), [node, truncateStrings]);
  const valueColor = getValueColor(value.type);

  return (
    <div className="flex items-start">
      {/* Indentation */}
      <div style={{ width: indent, minWidth: indent }} />

      {/* Chevron + Key + Value */}
      <div className="flex items-start gap-1 min-w-0 flex-1">
        {/* Chevron */}
        <button
          onClick={handleToggle}
          className={cn(
            'shrink-0 w-4 h-4 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors mt-0.5',
            !hasChildren && 'invisible'
          )}
          aria-label={isExpanded ? 'Collapse' : 'Expand'}
        >
          {isExpanded ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
        </button>

        {/* Key (if not root) */}
        {depth > 0 && (
          <span className={cn('shrink-0', colors.key)}>{key}</span>
        )}

        {/* Colon (if not root and has key) */}
        {depth > 0 && <span className={colors.colon}>: </span>}

        {/* Value or Preview */}
        {!isExpanded ? (
          // Collapsed: show preview
          <span className={cn('break-all', valueColor)}>{preview}</span>
        ) : (
          // Expanded: show opening bracket
          <span className={colors.bracket}>
            {value.type === 'object' ? '{' : '['}
          </span>
        )}
      </div>
    </div>
  );
}

function buildChildNodes(node: TreeNode, expanded: Set<string>): TreeNode[] {
  const children: TreeNode[] = [];
  const { value, depth, path } = node;

  if (!expanded.has(path)) {
    return children;
  }

  if (value.type === 'object') {
    value.keys.forEach((key, index) => {
      const childValue = parseJsonValue(value.value[key]);
      const childPath = `${path}.${key}`;
      children.push({
        key,
        path: childPath,
        value: childValue,
        depth: depth + 1,
      });

      // Recursively add children if expanded
      if (expanded.has(childPath)) {
        const childNode = children[children.length - 1];
        children.push(...buildChildNodes(childNode, expanded));
      }
    });
  } else if (value.type === 'array') {
    value.value.forEach((item, index) => {
      const childValue = parseJsonValue(item);
      const childPath = `${path}[${index}]`;
      children.push({
        key: String(index),
        path: childPath,
        value: childValue,
        depth: depth + 1,
      });

      // Recursively add children if expanded
      if (expanded.has(childPath)) {
        const childNode = children[children.length - 1];
        children.push(...buildChildNodes(childNode, expanded));
      }
    });
  }

  return children;
}

function buildClosingRow(node: TreeNode, expanded: Set<string>): TreeNode | null {
  const { value, depth, path } = node;

  if (!expanded.has(path)) {
    return null;
  }

  if (value.type === 'object' && value.keys.length > 0) {
    return {
      key: '',
      path: `${path}.closing`,
      value: { type: 'bracket', value: '}' } as unknown as JsonValue,
      depth,
    };
  }

  if (value.type === 'array' && value.length > 0) {
    return {
      key: '',
      path: `${path}.closing`,
      value: { type: 'bracket', value: ']' } as unknown as JsonValue,
      depth,
    };
  }

  return null;
}

export function JsonViewer({
  data,
  maxHeight = 400,
  showCopyButton = true,
  defaultExpanded = false,
  truncateStrings = true,
  className,
}: JsonViewerProps) {
  const [copied, setCopied] = useState(false);
  // Set to track expanded paths (empty = all collapsed by default)
  const [expanded, setExpanded] = useState<Set<string>>(() =>
    defaultExpanded ? new Set(['root']) : new Set()
  );

  // Parse the data
  const rootValue = useMemo(() => parseJsonRobust(data), [data]);

  // Generate the JSON string for copy
  const jsonString = useMemo(() => {
    try {
      return JSON.stringify(data, null, 2);
    } catch {
      return String(data);
    }
  }, [data]);

  // Build the root node
  const rootNode: TreeNode = {
    key: 'root',
    path: 'root',
    value: rootValue,
    depth: 0,
  };

  // Build all visible rows
  const visibleRows = useMemo(() => {
    const rows: TreeNode[] = [];

    // Add root row
    rows.push(rootNode);

    // Add children recursively
    const addChildren = (node: TreeNode) => {
      const children = buildChildNodes(node, expanded);
      rows.push(...children);

      // Add closing bracket for expanded containers
      if (
        (node.value.type === 'object' && node.value.keys.length > 0) ||
        (node.value.type === 'array' && node.value.length > 0)
      ) {
        const isExpanded = expanded.has(node.path);
        if (isExpanded) {
          rows.push({
            key: '',
            path: `${node.path}.closing`,
            value: {
              type: 'bracket',
              value: node.value.type === 'object' ? '}' : ']',
            } as unknown as JsonValue,
            depth: node.depth,
          });
        }
      }

      // Recurse for each child that is expanded
      children.forEach(child => {
        if (expanded.has(child.path)) {
          addChildren(child);
        }
      });
    };

    addChildren(rootNode);
    return rows;
  }, [expanded, rootNode]);

  const handleToggle = useCallback((path: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(jsonString);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Silently fail
    }
  }, [jsonString]);

  return (
    <div
      className={cn(
        'relative w-full min-w-0 rounded-md bg-muted font-mono text-xs leading-5',
        className
      )}
    >
      {showCopyButton && (
        <div className="absolute right-2 top-2 z-10">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 bg-muted/80 backdrop-blur-sm"
            onClick={handleCopy}
            aria-label={copied ? 'Copied!' : 'Copy to clipboard'}
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-emerald-400" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
      )}

      <ScrollArea className={cn('w-full', `max-h-[${maxHeight}px]`)}>
        <div className="p-3">
          <div className="flex flex-col gap-0.5">
            {visibleRows.map((node, index) => {
              // Check if this is a closing bracket row
              if (
                node.path.endsWith('.closing') &&
                node.value.type === 'bracket'
              ) {
                const indent = node.depth * 16;
                return (
                  <div key={node.path} className="flex items-start">
                    <div style={{ width: indent, minWidth: indent }} />
                    <div className="flex items-start gap-1 min-w-0 flex-1">
                      <span className="shrink-0 w-4" />
                      <span className={colors.bracket}>
                        {(node.value as unknown as { value: string }).value}
                      </span>
                    </div>
                  </div>
                );
              }

              const isExpanded = expanded.has(node.path);
              return (
                <TreeRow
                  key={node.path}
                  node={node}
                  isExpanded={isExpanded}
                  onToggle={handleToggle}
                  allExpanded={expanded}
                  truncateStrings={truncateStrings}
                />
              );
            })}
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
