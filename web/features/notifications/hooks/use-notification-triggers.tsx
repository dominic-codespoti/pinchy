'use client';

import { useCallback, useEffect } from 'react';
import { useWebSocket } from '@/shared/providers/websocket';
import { useNotifications } from '@/features/notifications/hooks/use-notifications';
import type { LogEntry } from '@/shared/types/common';

export function useNotificationTriggers() {
  const { lastMessage } = useWebSocket();
  const { addNotification, settings } = useNotifications();

  const handleWebSocketMessage = useCallback((message: unknown) => {
    if (!message || typeof message !== 'object') return;

    const msg = message as Record<string, unknown>;
    const type = msg.type as string;

    // Handle agent status changes
    if (settings.notifyOnAgentStatusChange) {
      if (type === 'agent_status_changed' || type === 'heartbeat') {
        const agentId = msg.agent_id as string;
        const hasHeartbeat = msg.has_heartbeat as boolean;

        if (agentId) {
          if (hasHeartbeat) {
            addNotification({
              type: 'success',
              title: 'Agent Online',
              message: `Agent ${agentId} is now online`,
              link: `/agents/${agentId}`,
              autoDismiss: true,
              duration: 5000,
            });
          } else {
            addNotification({
              type: 'warning',
              title: 'Agent Offline',
              message: `Agent ${agentId} went offline`,
              link: `/agents/${agentId}`,
              autoDismiss: true,
              duration: 5000,
            });
          }
        }
      }
    }

    // Handle cron job events
    if (type === 'cron_job_executed') {
      const success = msg.success as boolean;
      const jobId = msg.job_id as string;
      const agentId = msg.agent_id as string;

      if (success) {
        addNotification({
          type: 'success',
          title: 'Cron Job Completed',
          message: `Job ${jobId} executed successfully`,
          link: agentId ? `/agents/${agentId}` : '/cron',
          autoDismiss: true,
          duration: 3000,
        });
      } else {
        addNotification({
          type: 'error',
          title: 'Cron Job Failed',
          message: `Job ${jobId} failed to execute`,
          link: agentId ? `/agents/${agentId}` : '/cron',
          autoDismiss: false,
        });
      }
    }

    // Handle session events
    if (type === 'session_event') {
      const event = msg.event as string;
      const sessionId = msg.session_id as string;
      const agentId = msg.agent_id as string;

      if (event === 'created') {
        addNotification({
          type: 'info',
          title: 'New Session',
          message: `A new session has been created`,
          link: sessionId ? `/agents/${agentId}` : '/sessions',
          autoDismiss: true,
          duration: 3000,
        });
      }
    }

    // Handle skill activation
    if (type === 'skill_activated' || type === 'skill_deactivated') {
      const skillName = msg.skill_name as string;
      const activated = type === 'skill_activated';

      addNotification({
        type: 'info',
        title: activated ? 'Skill Activated' : 'Skill Deactivated',
        message: `Skill "${skillName}" has been ${activated ? 'activated' : 'deactivated'}`,
        link: '/skills',
        autoDismiss: true,
        duration: 3000,
      });
    }
  }, [addNotification, settings.notifyOnAgentStatusChange]);

  useEffect(() => {
    if (lastMessage) {
      handleWebSocketMessage(lastMessage);
    }
  }, [lastMessage, handleWebSocketMessage]);

  // Hook to trigger notifications from log entries
  const notifyFromLog = useCallback((log: LogEntry) => {
    if (!settings.notifyOnNewLog) return;

    if (log.level === 'error') {
      addNotification({
        type: 'error',
        title: 'Error Log',
        message: log.message,
        link: log.agentId ? `/agents/${log.agentId}` : '/logs',
        autoDismiss: false,
      });
    } else if (log.level === 'warn') {
      addNotification({
        type: 'warning',
        title: 'Warning Log',
        message: log.message,
        link: log.agentId ? `/agents/${log.agentId}` : '/logs',
        autoDismiss: true,
        duration: 5000,
      });
    }
  }, [addNotification, settings.notifyOnNewLog]);

  return { notifyFromLog };
}
