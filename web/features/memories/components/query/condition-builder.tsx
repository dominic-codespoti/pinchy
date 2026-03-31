'use client';

import { useState } from 'react';
import { Plus, Trash2, GripVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/shared/lib/utils';
import {
  Condition,
  ConditionGroup,
  LogicalOperator,
  ConditionField,
  ConditionOperator,
  isConditionGroup,
  createDefaultCondition,
  createDefaultGroup,
  getOperatorsForField,
  FIELD_OPTIONS,
} from './types';

interface ConditionRowProps {
  condition: Condition;
  onUpdate: (condition: Condition) => void;
  onDelete: () => void;
  availableAgents?: { id: string; name: string }[];
  availableCategories?: string[];
}

export function ConditionRow({
  condition,
  onUpdate,
  onDelete,
  availableAgents,
  availableCategories,
}: ConditionRowProps) {
  const operators = getOperatorsForField(condition.field);

  const handleFieldChange = (field: ConditionField) => {
    onUpdate({
      ...condition,
      field,
      operator: 'contains',
      value: '',
    });
  };

  const handleOperatorChange = (operator: ConditionOperator) => {
    onUpdate({
      ...condition,
      operator,
      value: operator === 'isEmpty' || operator === 'isNotEmpty' ? null : '',
    });
  };

  const renderValueInput = () => {
    if (condition.operator === 'isEmpty' || condition.operator === 'isNotEmpty') {
      return null;
    }

    if (condition.field === 'agentId') {
      if (condition.operator === 'in' || condition.operator === 'notIn') {
        // Multi-select for in/notIn operators
        return (
          <Select
            value={Array.isArray(condition.value) ? condition.value[0] || '' : condition.value as string}
            onValueChange={(v) => onUpdate({ ...condition, value: [v] })}
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Select agents..." />
            </SelectTrigger>
            <SelectContent>
              {availableAgents?.map((agent) => (
                <SelectItem key={agent.id} value={agent.id}>
                  {agent.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      }

      return (
        <Select
          value={condition.value as string}
          onValueChange={(v) => onUpdate({ ...condition, value: v })}
        >
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Select agent..." />
          </SelectTrigger>
          <SelectContent>
            {availableAgents?.map((agent) => (
              <SelectItem key={agent.id} value={agent.id}>
                {agent.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }

    if (condition.field === 'category') {
      if (condition.operator === 'in' || condition.operator === 'notIn') {
        return (
          <Select
            value={Array.isArray(condition.value) ? condition.value[0] || '' : condition.value as string}
            onValueChange={(v) => onUpdate({ ...condition, value: [v] })}
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Select categories..." />
            </SelectTrigger>
            <SelectContent>
              {availableCategories?.map((cat) => (
                <SelectItem key={cat} value={cat}>
                  {cat}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      }

      return (
        <Select
          value={condition.value as string}
          onValueChange={(v) => onUpdate({ ...condition, value: v })}
        >
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Select category..." />
          </SelectTrigger>
          <SelectContent>
            {availableCategories?.map((cat) => (
              <SelectItem key={cat} value={cat}>
                {cat}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }

    if (condition.field === 'timestamp') {
      if (condition.operator === 'between') {
        const range = condition.value as { from: string; to: string } || { from: '', to: '' };
        return (
          <div className="flex items-center gap-2">
            <Input
              type="date"
              value={range.from}
              onChange={(e) => onUpdate({ ...condition, value: { ...range, from: e.target.value } })}
              className="w-[140px]"
            />
            <span className="text-muted-foreground">to</span>
            <Input
              type="date"
              value={range.to}
              onChange={(e) => onUpdate({ ...condition, value: { ...range, to: e.target.value } })}
              className="w-[140px]"
            />
          </div>
        );
      }

      return (
        <Input
          type={dateOperatorToInputType(condition.operator)}
          value={condition.value as string}
          onChange={(e) => onUpdate({ ...condition, value: e.target.value })}
          placeholder="Enter date..."
          className="w-[200px]"
        />
      );
    }

    return (
      <Input
        value={(condition.value as string) || ''}
        onChange={(e) => onUpdate({ ...condition, value: e.target.value })}
        placeholder="Enter value..."
        className="w-[200px]"
      />
    );
  };

  return (
    <div className="flex items-center gap-2 p-2 bg-muted/50 rounded-md">
      <GripVertical className="size-4 text-muted-foreground cursor-grab" />

      <Select value={condition.field} onValueChange={(v) => handleFieldChange(v as ConditionField)}>
        <SelectTrigger className="w-[140px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {FIELD_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={condition.operator} onValueChange={(v) => handleOperatorChange(v as ConditionOperator)}>
        <SelectTrigger className="w-[160px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {operators.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {renderValueInput()}

      <Button variant="ghost" size="icon" onClick={onDelete} className="ml-auto">
        <Trash2 className="size-4 text-destructive" />
      </Button>
    </div>
  );
}

function dateOperatorToInputType(operator: ConditionOperator): string {
  switch (operator) {
    case 'equals':
      return 'date';
    case 'greaterThan':
    case 'lessThan':
      return 'datetime-local';
    default:
      return 'text';
  }
}

interface ConditionGroupProps {
  group: ConditionGroup;
  onUpdate: (group: ConditionGroup) => void;
  onDelete?: () => void;
  depth?: number;
  availableAgents?: { id: string; name: string }[];
  availableCategories?: string[];
}

export function ConditionGroupComponent({
  group,
  onUpdate,
  onDelete,
  depth = 0,
  availableAgents,
  availableCategories,
}: ConditionGroupProps) {
  const updateCondition = (index: number, updated: Condition | ConditionGroup) => {
    const newConditions = [...group.conditions];
    newConditions[index] = updated;
    onUpdate({ ...group, conditions: newConditions });
  };

  const deleteCondition = (index: number) => {
    const newConditions = group.conditions.filter((_, i) => i !== index);
    onUpdate({ ...group, conditions: newConditions });
  };

  const addCondition = () => {
    onUpdate({
      ...group,
      conditions: [...group.conditions, createDefaultCondition()],
    });
  };

  const addGroup = () => {
    onUpdate({
      ...group,
      conditions: [...group.conditions, createDefaultGroup(group.operator === 'AND' ? 'OR' : 'AND')],
    });
  };

  const setOperator = (operator: LogicalOperator) => {
    onUpdate({ ...group, operator });
  };

  return (
    <Card className={cn('border-2', depth > 0 && 'ml-4')}>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-muted-foreground">Match</span>
            <Select value={group.operator} onValueChange={(v) => setOperator(v as LogicalOperator)}>
              <SelectTrigger className="w-[80px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="AND">ALL</SelectItem>
                <SelectItem value="OR">ANY</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-sm font-medium text-muted-foreground">
              of the following:
            </span>
          </div>

          {onDelete && depth > 0 && (
            <Button variant="ghost" size="icon" onClick={onDelete}>
              <Trash2 className="size-4 text-destructive" />
            </Button>
          )}
        </div>

        <div className="space-y-2">
          {group.conditions.map((condition, index) =>
            isConditionGroup(condition) ? (
              <ConditionGroupComponent
                key={condition.id}
                group={condition}
                onUpdate={(updated) => updateCondition(index, updated)}
                onDelete={() => deleteCondition(index)}
                depth={depth + 1}
                availableAgents={availableAgents}
                availableCategories={availableCategories}
              />
            ) : (
              <ConditionRow
                key={condition.id}
                condition={condition}
                onUpdate={(updated) => updateCondition(index, updated)}
                onDelete={() => deleteCondition(index)}
                availableAgents={availableAgents}
                availableCategories={availableCategories}
              />
            )
          )}
        </div>

        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={addCondition}>
            <Plus className="size-4 mr-1" />
            Add Condition
          </Button>
          {depth < 2 && (
            <Button variant="outline" size="sm" onClick={addGroup}>
              <Plus className="size-4 mr-1" />
              Add Group
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
