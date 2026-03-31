import {
  SavedQuery,
  QueryHistoryItem,
  ConditionGroup,
} from './types';

const SAVED_QUERIES_KEY = 'pinchy-saved-queries';
const QUERY_HISTORY_KEY = 'pinchy-query-history';

export function loadSavedQueries(): SavedQuery[] {
  if (typeof window === 'undefined') return [];

  try {
    const saved = localStorage.getItem(SAVED_QUERIES_KEY);
    if (saved) {
      return JSON.parse(saved) as SavedQuery[];
    }
  } catch {
    console.error('Failed to load saved queries');
  }
  return [];
}

export function saveQuery(query: SavedQuery): void {
  if (typeof window === 'undefined') return;

  try {
    const queries = loadSavedQueries();
    const existingIndex = queries.findIndex(q => q.id === query.id);

    if (existingIndex >= 0) {
      queries[existingIndex] = { ...query, updatedAt: new Date().toISOString() };
    } else {
      queries.push(query);
    }

    localStorage.setItem(SAVED_QUERIES_KEY, JSON.stringify(queries));
  } catch {
    console.error('Failed to save query');
  }
}

export function deleteSavedQuery(queryId: string): void {
  if (typeof window === 'undefined') return;

  try {
    const queries = loadSavedQueries();
    const filtered = queries.filter(q => q.id !== queryId);
    localStorage.setItem(SAVED_QUERIES_KEY, JSON.stringify(filtered));
  } catch {
    console.error('Failed to delete saved query');
  }
}

export function duplicateSavedQuery(queryId: string): SavedQuery | null {
  const queries = loadSavedQueries();
  const original = queries.find(q => q.id === queryId);

  if (!original) return null;

  const duplicate: SavedQuery = {
    ...original,
    id: crypto.randomUUID(),
    name: `${original.name} (Copy)`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  saveQuery(duplicate);
  return duplicate;
}

export function exportQueryAsJson(query: SavedQuery): string {
  return JSON.stringify({
    name: query.name,
    description: query.description,
    group: query.group,
    exportedAt: new Date().toISOString(),
  }, null, 2);
}

export function importQueryFromJson(json: string): SavedQuery | null {
  try {
    const parsed = JSON.parse(json);

    if (!parsed.group || !parsed.name) {
      throw new Error('Invalid query format');
    }

    return {
      id: crypto.randomUUID(),
      name: parsed.name,
      description: parsed.description,
      group: parsed.group as ConditionGroup,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  } catch {
    console.error('Failed to import query');
    return null;
  }
}

export function addToQueryHistory(item: QueryHistoryItem): void {
  if (typeof window === 'undefined') return;

  try {
    const history = loadQueryHistory();
    const newHistory = [item, ...history].slice(0, 50);
    localStorage.setItem(QUERY_HISTORY_KEY, JSON.stringify(newHistory));
  } catch {
    console.error('Failed to add to query history');
  }
}

export function loadQueryHistory(): QueryHistoryItem[] {
  if (typeof window === 'undefined') return [];

  try {
    const saved = localStorage.getItem(QUERY_HISTORY_KEY);
    if (saved) {
      return JSON.parse(saved) as QueryHistoryItem[];
    }
  } catch {
    console.error('Failed to load query history');
  }
  return [];
}

export function clearQueryHistory(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(QUERY_HISTORY_KEY);
}
