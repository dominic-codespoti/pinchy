import { Bot, Plus } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

interface EmptyStateProps {
  onCreate?: () => void;
}

EmptyState.displayName = "EmptyState";

export function EmptyState({ onCreate }: EmptyStateProps) {
  return (
    <Card className="w-full">
      <CardHeader className="text-center">
        <div className="flex justify-center mb-4">
          <Avatar className="size-16">
            <AvatarFallback className="bg-muted">
              <Bot className="text-muted-foreground" />
            </AvatarFallback>
          </Avatar>
        </div>
        <CardTitle>No agents yet</CardTitle>
        <CardDescription>
          Create your first agent to get started with Pinchy.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex justify-center pb-6">
        <Button onClick={onCreate}>
          <Plus data-icon />
          Create Agent
        </Button>
      </CardContent>
    </Card>
  );
}
