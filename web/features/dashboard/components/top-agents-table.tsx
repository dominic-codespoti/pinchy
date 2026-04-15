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

interface TopAgentsTableProps {
  agents: DashboardAgent[] | undefined;
  loading: boolean;
}

export function TopAgentsTable({ agents, loading }: TopAgentsTableProps) {
  const topAgents = useMemo(() => agents?.slice(0, 5) ?? [], [agents]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base">Top Agents</CardTitle>
        <Badge variant="secondary">By Status</Badge>
      </CardHeader>
      <CardContent className="pt-0">
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-16" />
              </div>
            ))}
          </div>
        ) : topAgents.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No agents available</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Agent</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {topAgents.map((agent) => (
                <TableRow key={agent.id}>
                  <TableCell>
                    <Link href={`/agents/${agent.id}`} className="font-medium hover:underline">
                      {agent.name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        agent.status === 'active'
                          ? 'default'
                          : agent.status === 'error'
                            ? 'destructive'
                            : 'secondary'
                      }
                    >
                      {agent.status === 'active' ? 'Active' : agent.status === 'error' ? 'Error' : 'Inactive'}
                    </Badge>
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
