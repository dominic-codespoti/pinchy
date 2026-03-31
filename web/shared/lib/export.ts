import { Agent } from '@/features/agents/types';
import { Session } from '@/features/sessions/types';
import { CronJob } from '@/features/cron/types';
import { Memory } from '@/features/memories/types';

export type ExportFormat = 'csv' | 'json';
export type ExportEntity = 'agents' | 'sessions' | 'cron' | 'memories';

export interface DateRange {
  from?: Date;
  to?: Date;
}

function escapeCsv(value: string | number | boolean | undefined): string {
  if (value === undefined || value === null) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function filterByDateRange<T extends { createdAt?: string; timestamp?: string }>(
  items: T[],
  dateRange?: DateRange,
  dateField: 'createdAt' | 'timestamp' = 'createdAt'
): T[] {
  if (!dateRange?.from && !dateRange?.to) return items;

  return items.filter((item) => {
    const dateStr = dateField === 'createdAt' ? item.createdAt : item.timestamp;
    if (!dateStr) return true;

    const date = new Date(dateStr);
    if (dateRange.from && date < dateRange.from) return false;
    if (dateRange.to) {
      const endOfDay = new Date(dateRange.to);
      endOfDay.setHours(23, 59, 59, 999);
      if (date > endOfDay) return false;
    }
    return true;
  });
}

export function exportAgents(agents: Agent[], format: ExportFormat, dateRange?: DateRange) {
  const filteredAgents = filterByDateRange(agents, dateRange, 'createdAt');

  if (format === 'csv') {
    const headers = ['ID', 'Name', 'Description', 'Provider', 'Model', 'Status', 'Created At'];
    const rows = filteredAgents.map((agent) => [
      agent.id,
      agent.name,
      agent.description || '',
      agent.config.provider,
      agent.config.model,
      agent.status,
      agent.createdAt,
    ]);
    const csv = [headers.join(','), ...rows.map((row) => row.map(escapeCsv).join(','))].join('\n');
    downloadFile(csv, `agents-${new Date().toISOString().split('T')[0]}.csv`, 'text/csv');
  } else {
    const data = filteredAgents.map((agent) => ({
      id: agent.id,
      name: agent.name,
      description: agent.description,
      config: agent.config,
      status: agent.status,
      createdAt: agent.createdAt,
      hasHeartbeat: agent.hasHeartbeat,
      lastHeartbeatAt: agent.lastHeartbeatAt,
      heartbeatInterval: agent.heartbeatInterval,
    }));
    const json = JSON.stringify(data, null, 2);
    downloadFile(json, `agents-${new Date().toISOString().split('T')[0]}.json`, 'application/json');
  }
}

export function exportSessions(
  sessions: Session[],
  format: ExportFormat,
  dateRange?: DateRange,
  includeMessages?: boolean
) {
  const filteredSessions = filterByDateRange(sessions, dateRange, 'createdAt');

  if (format === 'csv') {
    const headers = ['ID', 'Agent ID', 'Title', 'Message Count', 'Created At', 'Updated At'];
    const rows = filteredSessions.map((session) => [
      session.id,
      session.agentId,
      session.title || '',
      session.messageCount,
      session.createdAt,
      session.updatedAt,
    ]);
    const csv = [headers.join(','), ...rows.map((row) => row.map(escapeCsv).join(','))].join('\n');
    downloadFile(csv, `sessions-${new Date().toISOString().split('T')[0]}.csv`, 'text/csv');
  } else {
    const data = filteredSessions.map((session) => ({
      id: session.id,
      agentId: session.agentId,
      title: session.title,
      messageCount: session.messageCount,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      ...(includeMessages && { messages: [] }),
    }));
    const json = JSON.stringify(data, null, 2);
    downloadFile(json, `sessions-${new Date().toISOString().split('T')[0]}.json`, 'application/json');
  }
}

export function exportCronJobs(jobs: CronJob[], format: ExportFormat, dateRange?: DateRange) {
  const filteredJobs = dateRange?.from || dateRange?.to
    ? jobs.filter((job) => {
        if (job.lastRun) {
          const date = new Date(job.lastRun);
          if (dateRange.from && date < dateRange.from) return false;
          if (dateRange.to) {
            const endOfDay = new Date(dateRange.to);
            endOfDay.setHours(23, 59, 59, 999);
            if (date > endOfDay) return false;
          }
        }
        return true;
      })
    : jobs;

  if (format === 'csv') {
    const headers = ['ID', 'Agent ID', 'Schedule', 'Message', 'Enabled', 'Last Run', 'Next Run'];
    const rows = filteredJobs.map((job) => [
      job.id,
      job.agentId,
      job.schedule,
      job.message,
      job.lastStatus ? 'Yes' : 'No',
      job.lastRun || '',
      job.nextRun || '',
    ]);
    const csv = [headers.join(','), ...rows.map((row) => row.map(escapeCsv).join(','))].join('\n');
    downloadFile(csv, `cron-jobs-${new Date().toISOString().split('T')[0]}.csv`, 'text/csv');
  } else {
    const json = JSON.stringify(filteredJobs, null, 2);
    downloadFile(json, `cron-jobs-${new Date().toISOString().split('T')[0]}.json`, 'application/json');
  }
}

export function exportMemories(
  memories: Memory[],
  format: ExportFormat,
  dateRange?: DateRange,
  agentName?: string
) {
  const filteredMemories = filterByDateRange(memories, dateRange, 'timestamp');

  if (format === 'csv') {
    const headers = ['ID', 'Agent ID', 'Content', 'Category', 'Timestamp'];
    const rows = filteredMemories.map((memory) => [
      memory.id,
      memory.agentId,
      memory.content,
      memory.category || '',
      memory.timestamp,
    ]);
    const csv = [headers.join(','), ...rows.map((row) => row.map(escapeCsv).join(','))].join('\n');
    const suffix = agentName ? `-${agentName}` : '';
    downloadFile(csv, `memories${suffix}-${new Date().toISOString().split('T')[0]}.csv`, 'text/csv');
  } else {
    const json = JSON.stringify(filteredMemories, null, 2);
    const suffix = agentName ? `-${agentName}` : '';
    downloadFile(json, `memories${suffix}-${new Date().toISOString().split('T')[0]}.json`, 'application/json');
  }
}

export function getDefaultDateRange(): DateRange {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 30);
  return { from, to };
}

export function formatDateForInput(date: Date): string {
  return date.toISOString().split('T')[0];
}
