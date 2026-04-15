'use client';

import { useState } from 'react';
import { Clock, Star, Trash2, Copy, Download, Upload, MoreVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { SavedQuery, QueryHistoryItem } from './types';
import { formatDistanceToNow } from 'date-fns';

interface QuerySidebarProps {
  savedQueries: SavedQuery[];
  queryHistory: QueryHistoryItem[];
  activeQueryId: string | null;
  onLoadQuery: (query: SavedQuery) => void;
  onDeleteQuery: (queryId: string) => void;
  onDuplicateQuery: (queryId: string) => void;
  onExportQuery: (query: SavedQuery) => void;
  onImportQuery: (json: string) => void;
  onClearHistory: () => void;
}

export function QuerySidebar({
  savedQueries,
  queryHistory,
  activeQueryId,
  onLoadQuery,
  onDeleteQuery,
  onDuplicateQuery,
  onExportQuery,
  onImportQuery,
  onClearHistory,
}: QuerySidebarProps) {
  const [deleteQueryId, setDeleteQueryId] = useState<string | null>(null);
  const [showImportDialog, setShowImportDialog] = useState(false);

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      onImportQuery(content);
      setShowImportDialog(false);
    };
    reader.readAsText(file);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Star className="h-4 w-4" />
              Saved Queries
            </CardTitle>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setShowImportDialog(true)}>
                  <Upload className="h-4 w-4 mr-2" />
                  Import Query
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="h-[200px]">
            {savedQueries.length === 0 ? (
              <div className="text-center py-4 text-sm text-muted-foreground px-4">
                No saved queries yet
              </div>
            ) : (
              <div className="divide-y">
                {savedQueries.map((query) => (
                  <div
                    key={query.id}
                    className={`flex items-center justify-between p-3 hover:bg-muted/50 cursor-pointer ${
                      activeQueryId === query.id ? 'bg-muted' : ''
                    }`}
                    onClick={() => onLoadQuery(query)}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{query.name}</p>
                      {query.description && (
                        <p className="text-xs text-muted-foreground truncate">
                          {query.description}
                        </p>
                      )}
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            onDuplicateQuery(query.id);
                          }}
                        >
                          <Copy className="h-4 w-4 mr-2" />
                          Duplicate
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            onExportQuery(query);
                          }}
                        >
                          <Download className="h-4 w-4 mr-2" />
                          Export
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteQueryId(query.id);
                          }}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Query History
            </CardTitle>
            {queryHistory.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onClearHistory}
              >
                Clear
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="h-[200px]">
            {queryHistory.length === 0 ? (
              <div className="text-center py-4 text-sm text-muted-foreground px-4">
                No query history yet
              </div>
            ) : (
              <div className="divide-y">
                {queryHistory.map((item) => (
                  <div
                    key={item.id}
                    className="p-3 hover:bg-muted/50 cursor-pointer"
                    onClick={() => {
                      const query: SavedQuery = {
                        id: item.id,
                        name: item.name,
                        group: item.group,
                        createdAt: item.executedAt,
                        updatedAt: item.executedAt,
                        resultCount: item.resultCount,
                      };
                      onLoadQuery(query);
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium truncate">{item.name}</p>
                      <Badge variant="secondary" className="text-xs">
                        {item.resultCount} results
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(item.executedAt), { addSuffix: true })}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteQueryId} onOpenChange={() => setDeleteQueryId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Saved Query</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this saved query? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteQueryId) {
                  onDeleteQuery(deleteQueryId);
                  setDeleteQueryId(null);
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Import Dialog */}
      <AlertDialog open={showImportDialog} onOpenChange={setShowImportDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Import Query</AlertDialogTitle>
            <AlertDialogDescription>
              Select a JSON file containing a saved query to import.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <input
              type="file"
              accept=".json"
              onChange={handleImport}
              className="block w-full text-sm text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-primary file:text-primary-foreground hover:file:bg-primary/90"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowImportDialog(false)}>
              Cancel
            </AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
