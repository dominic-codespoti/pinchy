'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Trash2, MessageSquare, AlertTriangle } from 'lucide-react';
import { Session } from '../types';
import { useDeleteSession } from '../hooks';

interface SessionsTableProps {
  sessions?: Session[];
  loading: boolean;
}

export function SessionsTable({ sessions, loading }: SessionsTableProps) {
  const [sessionToDelete, setSessionToDelete] = useState<Session | null>(null);
  const [isAlertOpen, setIsAlertOpen] = useState(false);
  const deleteSession = useDeleteSession();

  const handleDeleteClick = (session: Session) => {
    setSessionToDelete(session);
    setIsAlertOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (sessionToDelete) {
      await deleteSession.mutateAsync({
        sessionId: sessionToDelete.id,
        agentId: sessionToDelete.agentId,
      });
      setSessionToDelete(null);
      setIsAlertOpen(false);
    }
  };

  const handleCancelDelete = () => {
    setSessionToDelete(null);
    setIsAlertOpen(false);
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>All Sessions</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Agent</TableHead>
                  <TableHead>Message Count</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Updated</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sessions?.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="text-center text-muted-foreground py-8"
                    >
                      No sessions found. Start a chat to create your first session.
                    </TableCell>
                  </TableRow>
                ) : (
                  sessions?.map((session) => (
                    <TableRow key={session.id}>
                      <TableCell>
                        <Link
                          href={`/chat?session=${session.id}`}
                          className="font-medium hover:underline"
                        >
                          {session.title || 'Untitled Session'}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{session.agentId}</Badge>
                      </TableCell>
                      <TableCell>{session.messageCount}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(session.createdAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(session.updatedAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex gap-2 justify-end">
                          <Button variant="ghost" size="sm" asChild>
                            <Link href={`/chat?session=${session.id}`}>
                              <MessageSquare className="size-4" />
                              <span className="sr-only">View</span>
                            </Link>
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteClick(session)}
                            disabled={deleteSession.isPending}
                          >
                            <Trash2 className="size-4 text-destructive" />
                            <span className="sr-only">Delete</span>
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={isAlertOpen} onOpenChange={setIsAlertOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Delete Session?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{sessionToDelete?.title || 'Untitled Session'}&quot;?
              <br />
              <span className="text-destructive font-medium">
                This action cannot be undone. All messages in this session will be permanently lost.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCancelDelete}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={deleteSession.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteSession.isPending ? 'Deleting...' : 'Delete Session'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
