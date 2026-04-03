'use client';

import { useState, useMemo } from 'react';
import { Terminal, Search } from 'lucide-react';
import { PageContainer } from '@/shared/components/page-container';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useSlashCommands } from '../hooks';

function CommandCard({ command }: { command: { name: string; description: string } }) {
  return (
    <Card className="transition-colors hover:bg-muted/50">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="font-mono text-sm">
            {command.name}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">{command.description}</p>
      </CardContent>
    </Card>
  );
}

function CommandsSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <Card key={i}>
          <CardHeader className="pb-2">
            <Skeleton className="h-6 w-24" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-4 w-full" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function CommandsPage() {
  const { data: commands, isLoading } = useSlashCommands();
  const [search, setSearch] = useState('');

  const filteredCommands = useMemo(() => {
    if (!commands) return [];
    if (!search.trim()) return commands;

    const query = search.toLowerCase();
    return commands.filter(
      (cmd) =>
        cmd.name.toLowerCase().includes(query) ||
        cmd.description.toLowerCase().includes(query)
    );
  }, [commands, search]);

  return (
    <PageContainer className="space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
          <Terminal className="h-6 w-6" />
          Commands
        </h1>
        <p className="text-muted-foreground mt-1 text-sm sm:text-base">
          Discover available slash commands
        </p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search commands..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {isLoading ? (
        <CommandsSkeleton />
      ) : filteredCommands.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Terminal className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground">
              {search.trim() ? 'No commands match your search' : 'No commands available'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredCommands.map((command) => (
            <CommandCard key={command.name} command={command} />
          ))}
        </div>
      )}
    </PageContainer>
  );
}
