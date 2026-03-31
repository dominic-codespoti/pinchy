'use client';

import { FileDown, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Memory } from '../../types';
import { QueryResult } from './executor';

interface QueryResultsProps {
  result: QueryResult | null;
  onExport: (format: 'json' | 'csv') => void;
}

function MemoryCard({ memory }: { memory: Memory }) {
  const formattedDate = new Date(memory.timestamp).toLocaleDateString();

  return (
    <div className="p-3 border-b last:border-b-0 hover:bg-muted/50">
      <p className="text-sm leading-relaxed">{memory.content}</p>
      <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
        <span>{formattedDate}</span>
        {memory.category && (
          <Badge variant="secondary" className="text-xs">
            {memory.category}
          </Badge>
        )}
        <span className="font-mono">ID: {memory.id.slice(0, 8)}...</span>
      </div>
    </div>
  );
}

export function QueryResults({ result, onExport }: QueryResultsProps) {
  if (!result) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Query Results</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-8">
            Execute a query to see results
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-sm">Query Results</CardTitle>
            <Badge variant="secondary">{result.totalCount} results</Badge>
            <span className="text-xs text-muted-foreground">({result.executionTime}ms)</span>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => onExport('json')}>
              <Download className="h-4 w-4 mr-1" />
              JSON
            </Button>
            <Button variant="outline" size="sm" onClick={() => onExport('csv')}>
              <FileDown className="h-4 w-4 mr-1" />
              CSV
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {result.memories.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            No memories match your query criteria
          </div>
        ) : (
          <ScrollArea className="h-[300px]">
            <div className="divide-y">
              {result.memories.map((memory) => (
                <MemoryCard key={memory.id} memory={memory} />
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
