'use client';

import { useState, useEffect } from 'react';
import { Play, Save, RotateCcw, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { ConditionGroupComponent } from './condition-builder';
import { QuerySidebar } from './query-sidebar';
import { QueryResults } from './query-results';
import { SaveQueryDialog } from './save-query-dialog';
import {
  ConditionGroup,
  SavedQuery,
  QueryHistoryItem,
  createDefaultGroup,
} from './types';
import {
  loadSavedQueries,
  saveQuery,
  deleteSavedQuery,
  duplicateSavedQuery,
  exportQueryAsJson,
  importQueryFromJson,
  loadQueryHistory,
  addToQueryHistory,
  clearQueryHistory,
} from './storage';
import { executeQuery, QueryResult } from './executor';
import { Memory } from '../../types';
import { Agent } from '@/features/agents/types';

interface MemoryQueryBuilderProps {
  memories: Memory[];
  agents?: Agent[];
}

export function MemoryQueryBuilder({ memories, agents = [] }: MemoryQueryBuilderProps) {
  const [rootGroup, setRootGroup] = useState<ConditionGroup>(() => createDefaultGroup('AND'));
  const [savedQueries, setSavedQueries] = useState<SavedQuery[]>([]);
  const [queryHistory, setQueryHistory] = useState<QueryHistoryItem[]>([]);
  const [activeQueryId, setActiveQueryId] = useState<string | null>(null);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [queryResult, setQueryResult] = useState<QueryResult | null>(null);

  // Load saved queries and history on mount
  useEffect(() => {
    setSavedQueries(loadSavedQueries());
    setQueryHistory(loadQueryHistory());
  }, []);

  const handleExecuteQuery = () => {
    const result = executeQuery(memories, rootGroup);
    setQueryResult(result);

    // Add to history
    const historyItem: QueryHistoryItem = {
      id: crypto.randomUUID(),
      name: activeQueryId
        ? savedQueries.find(q => q.id === activeQueryId)?.name || 'Custom Query'
        : 'Custom Query',
      executedAt: new Date().toISOString(),
      resultCount: result.totalCount,
      group: rootGroup,
    };

    addToQueryHistory(historyItem);
    setQueryHistory(loadQueryHistory());

    toast.success(`Query executed: ${result.totalCount} results in ${result.executionTime}ms`);
  };

  const handleSaveQuery = (name: string, description: string) => {
    const query: SavedQuery = {
      id: activeQueryId || crypto.randomUUID(),
      name,
      description,
      group: rootGroup,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    saveQuery(query);
    setSavedQueries(loadSavedQueries());
    setActiveQueryId(query.id);
    toast.success('Query saved successfully');
  };

  const handleLoadQuery = (query: SavedQuery) => {
    setRootGroup(query.group);
    setActiveQueryId(query.id);
    toast.info(`Loaded query: ${query.name}`);
  };

  const handleDeleteQuery = (queryId: string) => {
    deleteSavedQuery(queryId);
    setSavedQueries(loadSavedQueries());
    if (activeQueryId === queryId) {
      setActiveQueryId(null);
    }
    toast.success('Query deleted');
  };

  const handleDuplicateQuery = (queryId: string) => {
    const duplicate = duplicateSavedQuery(queryId);
    if (duplicate) {
      setSavedQueries(loadSavedQueries());
      toast.success('Query duplicated');
    }
  };

  const handleExportQuery = (query: SavedQuery) => {
    const json = exportQueryAsJson(query);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${query.name.replace(/\s+/g, '_')}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('Query exported');
  };

  const handleImportQuery = (json: string) => {
    const query = importQueryFromJson(json);
    if (query) {
      saveQuery(query);
      setSavedQueries(loadSavedQueries());
      setRootGroup(query.group);
      setActiveQueryId(query.id);
      toast.success('Query imported successfully');
    } else {
      toast.error('Failed to import query');
    }
  };

  const handleClearHistory = () => {
    clearQueryHistory();
    setQueryHistory([]);
    toast.success('Query history cleared');
  };

  const handleReset = () => {
    setRootGroup(createDefaultGroup('AND'));
    setActiveQueryId(null);
    setQueryResult(null);
  };

  const handleExportResults = (format: 'json' | 'csv') => {
    if (!queryResult) return;

    if (format === 'json') {
      const json = JSON.stringify(queryResult.memories, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `query_results_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } else {
      // CSV export
      const headers = ['ID', 'Agent ID', 'Content', 'Category', 'Timestamp'];
      const rows = queryResult.memories.map(m => [
        m.id,
        m.agentId,
        `"${m.content.replace(/"/g, '""')}"`,
        m.category || '',
        m.timestamp,
      ]);
      const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `query_results_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }

    toast.success(`Results exported as ${format.toUpperCase()}`);
  };

  const availableAgents = agents.map(a => ({ id: a.id, name: a.name || a.id }));
  const availableCategories = Array.from(
    new Set(memories.map(m => m.category || 'general'))
  );

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Search className="h-6 w-6" />
            Memory Query Builder
          </h1>
          <p className="text-muted-foreground">
            Build complex queries to search through {memories.length} memories
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleReset}>
            <RotateCcw className="h-4 w-4 mr-2" />
            Reset
          </Button>
          <Button variant="outline" onClick={() => setSaveDialogOpen(true)}>
            <Save className="h-4 w-4 mr-2" />
            Save Query
          </Button>
          <Button onClick={handleExecuteQuery}>
            <Play className="h-4 w-4 mr-2" />
            Execute Query
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-3 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Query Conditions</CardTitle>
            </CardHeader>
            <CardContent>
              <ConditionGroupComponent
                group={rootGroup}
                onUpdate={setRootGroup}
                depth={0}
                availableAgents={availableAgents}
                availableCategories={availableCategories}
              />
            </CardContent>
          </Card>

          <QueryResults
            result={queryResult}
            onExport={handleExportResults}
          />
        </div>

        <div className="lg:col-span-1">
          <QuerySidebar
            savedQueries={savedQueries}
            queryHistory={queryHistory}
            activeQueryId={activeQueryId}
            onLoadQuery={handleLoadQuery}
            onDeleteQuery={handleDeleteQuery}
            onDuplicateQuery={handleDuplicateQuery}
            onExportQuery={handleExportQuery}
            onImportQuery={handleImportQuery}
            onClearHistory={handleClearHistory}
          />
        </div>
      </div>

      <SaveQueryDialog
        open={saveDialogOpen}
        onOpenChange={setSaveDialogOpen}
        onSave={handleSaveQuery}
        existingQuery={activeQueryId ? savedQueries.find(q => q.id === activeQueryId) : undefined}
      />
    </div>
  );
}
