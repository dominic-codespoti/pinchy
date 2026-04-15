import { Session } from '../types';

export type SessionGroupLabel = 'Today' | 'Yesterday' | 'Last 7 days' | 'Older';

export interface SessionGroup {
  label: SessionGroupLabel;
  sessions: Session[];
}

const SESSION_GROUP_LABELS: SessionGroupLabel[] = ['Today', 'Yesterday', 'Last 7 days', 'Older'];

export function getSessionGroupLabel(session: Session, now = new Date()): SessionGroupLabel {
  const sessionDate = new Date(session.updatedAt);
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);

  const startOfSession = new Date(sessionDate);
  startOfSession.setHours(0, 0, 0, 0);

  const dayDiff = Math.floor((startOfToday.getTime() - startOfSession.getTime()) / 86400000);

  if (dayDiff <= 0) return 'Today';
  if (dayDiff === 1) return 'Yesterday';
  if (dayDiff <= 7) return 'Last 7 days';
  return 'Older';
}

export function groupSessionsByRecency(sessions: Session[] | undefined): SessionGroup[] {
  const grouped = new Map<SessionGroupLabel, Session[]>();

  for (const label of SESSION_GROUP_LABELS) {
    grouped.set(label, []);
  }

  for (const session of sessions ?? []) {
    grouped.get(getSessionGroupLabel(session))?.push(session);
  }

  return SESSION_GROUP_LABELS
    .map((label) => ({ label, sessions: grouped.get(label) ?? [] }))
    .filter((group) => group.sessions.length > 0);
}
