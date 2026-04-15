export type ConditionOperator =
  | 'contains'
  | 'exact'
  | 'startsWith'
  | 'endsWith'
  | 'equals'
  | 'notEquals'
  | 'greaterThan'
  | 'lessThan'
  | 'greaterThanOrEqual'
  | 'lessThanOrEqual'
  | 'between'
  | 'in'
  | 'notIn'
  | 'isEmpty'
  | 'isNotEmpty';

export type ConditionField =
  | 'content'
  | 'category'
  | 'tags'
  | 'agentId'
  | 'timestamp';

export interface Condition {
  id: string;
  field: ConditionField;
  operator: ConditionOperator;
  value: string | string[] | { from: string; to: string } | null;
}

export type LogicalOperator = 'AND' | 'OR';

export interface ConditionGroup {
  id: string;
  operator: LogicalOperator;
  conditions: (Condition | ConditionGroup)[];
}

export interface SavedQuery {
  id: string;
  name: string;
  description?: string;
  group: ConditionGroup;
  createdAt: string;
  updatedAt: string;
  resultCount?: number;
}

export interface QueryHistoryItem {
  id: string;
  name: string;
  executedAt: string;
  resultCount: number;
  group: ConditionGroup;
}

export const FIELD_OPTIONS: { value: ConditionField; label: string }[] = [
  { value: 'content', label: 'Content' },
  { value: 'category', label: 'Category' },
  { value: 'agentId', label: 'Agent' },
  { value: 'timestamp', label: 'Created Date' },
];

export const TEXT_OPERATORS: { value: ConditionOperator; label: string }[] = [
  { value: 'contains', label: 'Contains' },
  { value: 'exact', label: 'Exact Match' },
  { value: 'startsWith', label: 'Starts With' },
  { value: 'endsWith', label: 'Ends With' },
  { value: 'isEmpty', label: 'Is Empty' },
  { value: 'isNotEmpty', label: 'Is Not Empty' },
];

export function getOperatorsForField(field: ConditionField): { value: ConditionOperator; label: string }[] {
  switch (field) {
    case 'content':
      return TEXT_OPERATORS;
    case 'category':
      return [
        { value: 'equals', label: 'Equals' },
        { value: 'notEquals', label: 'Not Equals' },
        { value: 'contains', label: 'Contains' },
        { value: 'isEmpty', label: 'Is Empty' },
        { value: 'isNotEmpty', label: 'Is Not Empty' },
      ];
    case 'agentId':
      return [
        { value: 'equals', label: 'Is' },
        { value: 'notEquals', label: 'Is Not' },
        { value: 'in', label: 'Is Any Of' },
        { value: 'notIn', label: 'Is None Of' },
      ];
    case 'timestamp':
      return [
        { value: 'equals', label: 'On Date' },
        { value: 'greaterThan', label: 'After' },
        { value: 'lessThan', label: 'Before' },
        { value: 'between', label: 'Between' },
      ];
    default:
      return TEXT_OPERATORS;
  }
}

export function createDefaultCondition(): Condition {
  return {
    id: crypto.randomUUID(),
    field: 'content',
    operator: 'contains',
    value: '',
  };
}

export function createDefaultGroup(operator: LogicalOperator = 'AND'): ConditionGroup {
  return {
    id: crypto.randomUUID(),
    operator,
    conditions: [createDefaultCondition()],
  };
}

export function isConditionGroup(item: Condition | ConditionGroup): item is ConditionGroup {
  return 'conditions' in item;
}

export function isCondition(item: Condition | ConditionGroup): item is Condition {
  return !('conditions' in item);
}
