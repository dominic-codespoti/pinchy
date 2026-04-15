import { Memory } from '../../types';
import {
  Condition,
  ConditionGroup,
  isConditionGroup,
} from './types';
import { parseISO, isAfter, isBefore, isEqual, subDays, subHours, subWeeks, subMonths } from 'date-fns';

export interface QueryResult {
  memories: Memory[];
  totalCount: number;
  executionTime: number;
}

export function executeQuery(
  memories: Memory[],
  group: ConditionGroup
): QueryResult {
  const startTime = performance.now();

  const filtered = memories.filter(memory => evaluateGroup(memory, group));

  const endTime = performance.now();

  return {
    memories: filtered,
    totalCount: filtered.length,
    executionTime: Math.round(endTime - startTime),
  };
}

function evaluateGroup(memory: Memory, group: ConditionGroup): boolean {
  if (group.conditions.length === 0) return true;

  const results = group.conditions.map(condition =>
    isConditionGroup(condition)
      ? evaluateGroup(memory, condition)
      : evaluateCondition(memory, condition)
  );

  if (group.operator === 'AND') {
    return results.every(r => r);
  } else {
    return results.some(r => r);
  }
}

function evaluateCondition(memory: Memory, condition: Condition): boolean {
  const { field, operator, value } = condition;

  const fieldValue = getFieldValue(memory, field);

  switch (operator) {
    case 'contains':
      return contains(fieldValue, value);
    case 'exact':
      return exactMatch(fieldValue, value);
    case 'startsWith':
      return startsWith(fieldValue, value);
    case 'endsWith':
      return endsWith(fieldValue, value);
    case 'equals':
      return equals(fieldValue, value);
    case 'notEquals':
      return !equals(fieldValue, value);
    case 'greaterThan':
      return greaterThan(fieldValue, value);
    case 'lessThan':
      return lessThan(fieldValue, value);
    case 'greaterThanOrEqual':
      return greaterThanOrEqual(fieldValue, value);
    case 'lessThanOrEqual':
      return lessThanOrEqual(fieldValue, value);
    case 'between':
      return between(fieldValue, value);
    case 'in':
      return inArray(fieldValue, value);
    case 'notIn':
      return !inArray(fieldValue, value);
    case 'isEmpty':
      return isEmpty(fieldValue);
    case 'isNotEmpty':
      return !isEmpty(fieldValue);
    default:
      return true;
  }
}

function getFieldValue(memory: Memory, field: string): unknown {
  switch (field) {
    case 'content':
      return memory.content;
    case 'category':
      return memory.category || '';
    case 'agentId':
      return memory.agentId;
    case 'timestamp':
      return memory.timestamp;
    default:
      return '';
  }
}

function contains(fieldValue: unknown, searchValue: unknown): boolean {
  if (typeof searchValue !== 'string') return false;
  const str = String(fieldValue).toLowerCase();
  return str.includes(searchValue.toLowerCase());
}

function exactMatch(fieldValue: unknown, searchValue: unknown): boolean {
  return String(fieldValue).toLowerCase() === String(searchValue).toLowerCase();
}

function startsWith(fieldValue: unknown, searchValue: unknown): boolean {
  if (typeof searchValue !== 'string') return false;
  return String(fieldValue).toLowerCase().startsWith(searchValue.toLowerCase());
}

function endsWith(fieldValue: unknown, searchValue: unknown): boolean {
  if (typeof searchValue !== 'string') return false;
  return String(fieldValue).toLowerCase().endsWith(searchValue.toLowerCase());
}

function equals(fieldValue: unknown, searchValue: unknown): boolean {
  if (fieldValue instanceof Date || (typeof fieldValue === 'string' && isValidDate(fieldValue))) {
    const fieldDate = typeof fieldValue === 'string' ? parseISO(fieldValue) : fieldValue;

    if (typeof searchValue === 'string') {
      if (searchValue.startsWith('last:')) {
        const [, amount, unit] = searchValue.split(':');
        const now = new Date();
        let comparisonDate: Date;

        switch (unit) {
          case 'hours':
            comparisonDate = subHours(now, parseInt(amount));
            break;
          case 'days':
            comparisonDate = subDays(now, parseInt(amount));
            break;
          case 'weeks':
            comparisonDate = subWeeks(now, parseInt(amount));
            break;
          case 'months':
            comparisonDate = subMonths(now, parseInt(amount));
            break;
          default:
            comparisonDate = subDays(now, parseInt(amount));
        }

        return isAfter(fieldDate, comparisonDate) || isEqual(fieldDate, comparisonDate);
      }

      const searchDate = parseISO(searchValue);
      return isEqual(fieldDate, searchDate);
    }
  }

  return String(fieldValue) === String(searchValue);
}

function greaterThan(fieldValue: unknown, searchValue: unknown): boolean {
  if (isNumeric(fieldValue) && isNumeric(searchValue)) {
    return Number(fieldValue) > Number(searchValue);
  }

  if (typeof fieldValue === 'string' && isValidDate(fieldValue)) {
    const fieldDate = parseISO(fieldValue);
    const searchDate = typeof searchValue === 'string' ? parseISO(searchValue) : new Date();
    return isAfter(fieldDate, searchDate);
  }

  return String(fieldValue) > String(searchValue);
}

function lessThan(fieldValue: unknown, searchValue: unknown): boolean {
  if (isNumeric(fieldValue) && isNumeric(searchValue)) {
    return Number(fieldValue) < Number(searchValue);
  }

  if (typeof fieldValue === 'string' && isValidDate(fieldValue)) {
    const fieldDate = parseISO(fieldValue);
    const searchDate = typeof searchValue === 'string' ? parseISO(searchValue) : new Date();
    return isBefore(fieldDate, searchDate);
  }

  return String(fieldValue) < String(searchValue);
}

function greaterThanOrEqual(fieldValue: unknown, searchValue: unknown): boolean {
  return greaterThan(fieldValue, searchValue) || equals(fieldValue, searchValue);
}

function lessThanOrEqual(fieldValue: unknown, searchValue: unknown): boolean {
  return lessThan(fieldValue, searchValue) || equals(fieldValue, searchValue);
}

function between(fieldValue: unknown, searchValue: unknown): boolean {
  if (typeof searchValue !== 'object' || searchValue === null) return false;

  const { from, to } = searchValue as { from: string; to: string };

  if (typeof fieldValue === 'string' && isValidDate(fieldValue)) {
    const fieldDate = parseISO(fieldValue);
    const fromDate = parseISO(from);
    const toDate = parseISO(to);

    return (isAfter(fieldDate, fromDate) || isEqual(fieldDate, fromDate)) &&
           (isBefore(fieldDate, toDate) || isEqual(fieldDate, toDate));
  }

  if (isNumeric(fieldValue)) {
    const num = Number(fieldValue);
    return num >= Number(from) && num <= Number(to);
  }

  return String(fieldValue) >= from && String(fieldValue) <= to;
}

function inArray(fieldValue: unknown, searchValue: unknown): boolean {
  if (!Array.isArray(searchValue)) {
    if (typeof searchValue === 'string') {
      return String(fieldValue).toLowerCase() === searchValue.toLowerCase();
    }
    return false;
  }

  return searchValue.some(v =>
    String(fieldValue).toLowerCase() === String(v).toLowerCase()
  );
}

function isEmpty(fieldValue: unknown): boolean {
  if (fieldValue === null || fieldValue === undefined) return true;
  if (typeof fieldValue === 'string') return fieldValue.trim() === '';
  if (Array.isArray(fieldValue)) return fieldValue.length === 0;
  return false;
}

function isNumeric(value: unknown): boolean {
  return typeof value === 'number' || (typeof value === 'string' && !isNaN(Number(value)) && value !== '');
}

function isValidDate(value: string): boolean {
  const date = parseISO(value);
  return !isNaN(date.getTime());
}
