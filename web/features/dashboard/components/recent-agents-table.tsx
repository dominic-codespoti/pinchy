'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { DashboardAgent } from '../types';

interface RecentAgentsTableProps {
  agents: DashboardAgent[] | undefined;
  loading: boolean;
}

export function RecentAgentsTable({ agents, loading }: RecentAgentsTableProps) {
  const sortedAgents = useMemo(() => {
    if (!agents) return [];
    return [...agents]
      .sort((a, b) => {
        const aDate = a.lastHeartbeatAt ? new Date(a.lastHeartbeatAt).getTime() : 0;
        const bDate = b.lastHeartbeatAt ? new Date(b.lastHeartbeatAt).getTime() : 0;
        return bDate - aDate;
      })
      .slice(0, 5);
  }, [agents]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base">Recent Activity</CardTitle>
        <Badge variant="secondary">Last 5</Badge>
      </CardHeader>
      <CardContent className="pt-0">
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-20" />
              </div>
            ))}
          </div>
        ) : sortedAgents.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No recent activity</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Agent</TableHead>
                <TableHead>Last Seen</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedAgents.map((agent) => (
                <TableRow key={agent.id}>
                  <TableCell>
                    <Link href={`/agents/${agent.id}`} className="font-medium hover:underline">
                      {agent.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {agent.lastHeartbeatAt
                      ? new Date(agent.lastHeartbeatAt).toLocaleDateString()
                      : 'Never'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
