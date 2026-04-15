'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
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
import { AgentPerformance } from '../types';

interface AgentsBreakdownTabProps {
  agentPerformance: AgentPerformance[];
  loading: boolean;
}

export function AgentsBreakdownTab({ agentPerformance, loading }: AgentsBreakdownTabProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base sm:text-lg">Agent Performance</CardTitle>
        <CardDescription>Usage statistics per agent</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : agentPerformance.length === 0 ? (
          <div className="flex items-center justify-center h-[150px] text-sm text-muted-foreground">
            No agent performance data available
          </div>
        ) : (
          <div className="overflow-x-auto -mx-4 sm:-mx-0">
            <div className="min-w-[600px] px-4 sm:px-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-left text-xs font-medium text-muted-foreground">
                      Agent
                    </TableHead>
                    <TableHead className="text-right text-xs font-medium text-muted-foreground">
                      Requests
                    </TableHead>
                    <TableHead className="text-right text-xs font-medium text-muted-foreground">
                      Avg Response
                    </TableHead>
                    <TableHead className="text-right text-xs font-medium text-muted-foreground">
                      Total Tokens
                    </TableHead>
                    <TableHead className="text-right text-xs font-medium text-muted-foreground">
                      Est. Cost
                    </TableHead>
                    <TableHead className="text-right text-xs font-medium text-muted-foreground">
                      Success Rate
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {agentPerformance.map((agent) => (
                    <TableRow key={agent.agentId}>
                      <TableCell className="py-3">
                        <Badge variant="outline" className="font-mono text-xs">
                          {agent.agentId.slice(0, 12)}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-3 text-right text-xs sm:text-sm">
                        {agent.requests.toLocaleString()}
                      </TableCell>
                      <TableCell className="py-3 text-right text-xs sm:text-sm">
                        {agent.avgResponseTime}ms
                      </TableCell>
                      <TableCell className="py-3 text-right text-xs sm:text-sm">
                        {agent.tokens.toLocaleString()}
                      </TableCell>
                      <TableCell className="py-3 text-right text-xs sm:text-sm">
                        ${agent.cost.toFixed(2)}
                      </TableCell>
                      <TableCell className="py-3 text-right">
                        <Badge
                          variant={agent.successRate > 0.95 ? 'secondary' : 'outline'}
                          className="text-xs"
                        >
                          {(agent.successRate * 100).toFixed(1)}%
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
