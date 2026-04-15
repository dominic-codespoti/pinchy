'use client';

import { useState, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Terminal, Globe, Variable, Pencil, Trash2 } from 'lucide-react';
import { McpServerCardProps } from './mcp-types';
import { transportBadgeVariant, transportLabel } from './mcp-utils';

export function McpServerCard({ name, server, onEdit, onDelete }: McpServerCardProps) {
  const envCount = server.env ? Object.keys(server.env).length : 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <CardTitle className="text-lg">{name}</CardTitle>
              <Badge variant={transportBadgeVariant(server.transport)}>
                {transportLabel(server.transport)}
              </Badge>
            </div>
            <CardDescription className="font-mono text-xs">
              {server.transport === 'stdio' ? (
                <span className="flex items-center gap-1">
                  <Terminal className="h-3 w-3" />
                  {server.command ?? 'No command'}
                  {server.args && server.args.length > 0 && (
                    <span className="text-muted-foreground">
                      {' '}
                      {server.args.join(' ')}
                    </span>
                  )}
                </span>
              ) : (
                <span className="flex items-center gap-1">
                  <Globe className="h-3 w-3" />
                  {server.url ?? 'No URL'}
                </span>
              )}
            </CardDescription>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onEdit(name, server)}
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onDelete(name)}
            >
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        </div>
      </CardHeader>
      {envCount > 0 && (
        <CardContent className="pt-0">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Variable className="h-3 w-3" />
            <span>{envCount} environment variable(s)</span>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
