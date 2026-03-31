'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Trash2, ArrowDown, Wifi, WifiOff, AlertCircle } from 'lucide-react';

// Log entry interface matching backend format from src/logs.rs
interface LogEntry {
  type: 'log';
  level: 'ERROR' | 'WARN' | 'INFO' | 'DEBUG' | 'TRACE';
  target: string;
  message: string;
  fields?: Record<string, unknown>;
  ts: string;
}

type LogLevel = LogEntry['level'] | 'all';

const LOG_LEVELS: { value: LogLevel; label: string; color: string }[] = [
  { value: 'all', label: 'All', color: 'bg-muted text-muted-foreground' },
  { value: 'ERROR', label: 'Error', color: 'bg-destructive text-destructive-foreground' },
  { value: 'WARN', label: 'Warn', color: 'bg-yellow-500 text-yellow-950' },
  { value: 'INFO', label: 'Info', color: 'bg-blue-500 text-white' },
  { value: 'DEBUG', label: 'Debug', color: 'bg-gray-500 text-white' },
  { value: 'TRACE', label: 'Trace', color: 'bg-purple-500 text-white' },
];

const MAX_LOGS = 2000;

export function LogsPage() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [filterLevel, setFilterLevel] = useState<LogLevel>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [connected, setConnected] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [isUserScrolling, setIsUserScrolling] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Color mapping for log levels
  const getLevelColor = (level: string): string => {
    switch (level) {
      case 'ERROR':
        return 'bg-destructive text-destructive-foreground';
      case 'WARN':
        return 'bg-yellow-500 text-yellow-950';
      case 'INFO':
        return 'bg-blue-500 text-white';
      case 'DEBUG':
        return 'bg-gray-500 text-white';
      case 'TRACE':
        return 'bg-purple-500 text-white';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  // WebSocket connection
  const connect = useCallback(() => {
    if (typeof window === 'undefined') return;
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.hostname}:3131/ws/logs`;

    if (process.env.NODE_ENV === 'development') {
      console.debug('[Logs] Connecting to:', wsUrl);
    }

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (process.env.NODE_ENV === 'development') {
          console.debug('[Logs] Connected');
        }
        setConnected(true);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'log') {
            setLogs((prev) => {
              const newLogs = [...prev, data as LogEntry];
              // Keep only last MAX_LOGS
              return newLogs.length > MAX_LOGS ? newLogs.slice(-MAX_LOGS) : newLogs;
            });
          } else if (data.type === 'error') {
            console.error('[Logs] Server error:', data.message);
          }
        } catch {
          // Handle non-JSON messages as plain text
          setLogs((prev) => {
            const entry: LogEntry = {
              type: 'log',
              level: 'INFO',
              target: 'websocket',
              message: event.data,
              ts: new Date().toISOString(),
            };
            const newLogs = [...prev, entry];
            return newLogs.length > MAX_LOGS ? newLogs.slice(-MAX_LOGS) : newLogs;
          });
        }
      };

      ws.onclose = () => {
        if (process.env.NODE_ENV === 'development') {
          console.debug('[Logs] Disconnected');
        }
        setConnected(false);
        wsRef.current = null;

        // Auto-reconnect after 3 seconds
        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, 3000);
      };

      ws.onerror = () => {
        if (process.env.NODE_ENV === 'development') {
          console.warn('[Logs] Connection error');
        }
        setConnected(false);
      };
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('[Logs] Failed to connect:', error);
      }
      setConnected(false);
    }
  }, []);

  // Connect on mount
  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect]);

  // Auto-scroll to bottom when new logs arrive (if enabled)
  useEffect(() => {
    if (!autoScroll || isUserScrolling) return;

    const scrollArea = scrollAreaRef.current;
    if (scrollArea) {
      // Use requestAnimationFrame for smoother scrolling
      requestAnimationFrame(() => {
        scrollArea.scrollTop = scrollArea.scrollHeight;
      });
    }
  }, [logs, autoScroll, isUserScrolling]);

  // Handle scroll events to detect user scrolling
  const handleScroll = useCallback(() => {
    const scrollArea = scrollAreaRef.current;
    if (!scrollArea) return;

    const isAtBottom =
      scrollArea.scrollHeight - scrollArea.scrollTop - scrollArea.clientHeight < 50;

    if (!isAtBottom && autoScroll) {
      setIsUserScrolling(true);
      setAutoScroll(false);
    } else if (isAtBottom && isUserScrolling) {
      setIsUserScrolling(false);
    }
  }, [autoScroll, isUserScrolling]);

  // Filter and search logs
  const filteredLogs = logs.filter((log) => {
    // Level filter
    if (filterLevel !== 'all' && log.level !== filterLevel) {
      return false;
    }

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        log.message.toLowerCase().includes(query) ||
        log.target.toLowerCase().includes(query) ||
        log.level.toLowerCase().includes(query)
      );
    }

    return true;
  });

  // Clear logs
  const handleClear = () => {
    setLogs([]);
  };

  // Resume auto-scroll
  const handleResumeScroll = () => {
    setAutoScroll(true);
    setIsUserScrolling(false);
    const scrollArea = scrollAreaRef.current;
    if (scrollArea) {
      scrollArea.scrollTop = scrollArea.scrollHeight;
    }
  };

  // Format timestamp for display
  const formatTimestamp = (ts: string): string => {
    try {
      const date = new Date(ts);
      return date.toLocaleTimeString('en-US', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        fractionalSecondDigits: 3,
      });
    } catch {
      return ts;
    }
  };

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col gap-4 p-4">
      {/* Header */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CardTitle>System Logs</CardTitle>
              <Badge variant={connected ? 'default' : 'secondary'} className="gap-1">
                {connected ? (
                  <>
                    <Wifi className="h-3 w-3" />
                    Connected
                  </>
                ) : (
                  <>
                    <WifiOff className="h-3 w-3" />
                    Disconnected
                  </>
                )}
              </Badge>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>{filteredLogs.length.toLocaleString()} logs</span>
              <span className="text-muted-foreground/50">|</span>
              <span>{logs.length.toLocaleString()} total</span>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Filter bar */}
      <Card>
        <CardContent className="py-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            {/* Level filters */}
            <div className="flex flex-wrap gap-1">
              {LOG_LEVELS.map(({ value, label, color }) => (
                <Button
                  key={value}
                  variant={filterLevel === value ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setFilterLevel(value)}
                  className="h-7 text-xs"
                >
                  <span className={`mr-1.5 inline-block h-2 w-2 rounded-full ${color}`} />
                  {label}
                </Button>
              ))}
            </div>

            {/* Search and actions */}
            <div className="flex items-center gap-2">
              <Input
                placeholder="Search logs..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-8 w-full sm:w-64"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={handleClear}
                className="h-8 gap-1"
              >
                <Trash2 className="h-4 w-4" />
                Clear
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Log display */}
      <Card className="flex-1 overflow-hidden">
        <CardContent className="relative h-full p-0">
          <ScrollArea className="h-full" onScrollCapture={handleScroll}>
            <div ref={scrollAreaRef} className="p-4">
              {filteredLogs.length === 0 ? (
                <div className="flex h-32 flex-col items-center justify-center text-muted-foreground">
                  <AlertCircle className="mb-2 h-8 w-8" />
                  <p className="text-sm">
                    {logs.length === 0
                      ? 'No logs yet. Waiting for log stream...'
                      : 'No logs match your filters'}
                  </p>
                </div>
              ) : (
                <div className="space-y-1">
                  {filteredLogs.map((log, index) => (
                    <div
                      key={`${log.ts}-${index}`}
                      className="flex items-start gap-2 font-mono text-xs leading-relaxed"
                    >
                      <Badge
                        className={`mt-0.5 shrink-0 ${getLevelColor(log.level)}`}
                        variant="secondary"
                      >
                        {log.level}
                      </Badge>
                      <span className="shrink-0 text-muted-foreground">
                        {formatTimestamp(log.ts)}
                      </span>
                      <span className="shrink-0 text-muted-foreground/70">[{log.target}]</span>
                      <span className="break-all text-foreground">{log.message}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </ScrollArea>

          {/* Resume scroll button */}
          {!autoScroll && filteredLogs.length > 0 && (
            <Button
              variant="secondary"
              size="sm"
              onClick={handleResumeScroll}
              className="absolute bottom-4 right-4 gap-1 shadow-lg"
            >
              <ArrowDown className="h-4 w-4" />
              Resume
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

LogsPage.displayName = 'LogsPage';
