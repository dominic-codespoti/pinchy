'use client';

import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Save, FileText, Wrench, Heart, RefreshCw } from 'lucide-react';
import { Agent } from '../types';

type FileType = 'soul' | 'tools' | 'heartbeat';

interface FileConfig {
  id: FileType;
  name: string;
  description: string;
  icon: React.ReactNode;
  placeholder: string;
}

const FILE_CONFIGS: FileConfig[] = [
  {
    id: 'soul',
    name: 'SOUL.md',
    description: 'Agent personality and system prompt',
    icon: <FileText className="h-4 w-4" />,
    placeholder: 'You are a helpful AI assistant...',
  },
  {
    id: 'tools',
    name: 'TOOLS.md',
    description: 'Tool usage instructions and guidelines',
    icon: <Wrench className="h-4 w-4" />,
    placeholder: '# Tool Instructions\n\n## read_file\nUse this to read files...',
  },
  {
    id: 'heartbeat',
    name: 'HEARTBEAT.md',
    description: 'Heartbeat task description and goals',
    icon: <Heart className="h-4 w-4" />,
    placeholder: 'Check for new pull requests and review them...',
  },
];

interface AgentFilesTabProps {
  agent: Agent;
  isLoading?: boolean;
  onSave?: (fileType: FileType, content: string) => void;
}

export function AgentFilesTab({ agent, isLoading, onSave }: AgentFilesTabProps) {
  const [selectedFile, setSelectedFile] = useState<FileType>('soul');
  const [content, setContent] = useState<string>(agent.soul || '');
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  const currentFile = FILE_CONFIGS.find((f) => f.id === selectedFile)!;

  const handleFileChange = (value: FileType) => {
    setSelectedFile(value);
    // Load content based on selected file
    switch (value) {
      case 'soul':
        setContent(agent.soul || '');
        break;
      case 'tools':
        setContent(agent.tools || '');
        break;
      case 'heartbeat':
        setContent(agent.heartbeat || '');
        break;
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave?.(selectedFile, content);
      setLastSaved(new Date());
    } finally {
      setIsSaving(false);
    }
  };

  const hasChanges = () => {
    switch (selectedFile) {
      case 'soul':
        return content !== (agent.soul || '');
      case 'tools':
        return content !== (agent.tools || '');
      case 'heartbeat':
        return content !== (agent.heartbeat || '');
      default:
        return false;
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-4 w-48" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-8 w-full mb-4" />
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                {currentFile.icon}
                Agent Files
              </CardTitle>
              <CardDescription>Edit agent configuration files</CardDescription>
            </div>
            {lastSaved && (
              <Badge variant="outline" className="gap-1">
                <RefreshCw className="h-3 w-3" />
                Saved {lastSaved.toLocaleTimeString()}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="file-select">Select File</Label>
            <Select value={selectedFile} onValueChange={(v) => handleFileChange(v as FileType)}>
              <SelectTrigger id="file-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FILE_CONFIGS.map((file) => (
                  <SelectItem key={file.id} value={file.id}>
                    <div className="flex items-center gap-2">
                      {file.icon}
                      <span>{file.name}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{currentFile.description}</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="file-content">Content</Label>
            <Textarea
              id="file-content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={currentFile.placeholder}
              className="min-h-[300px] font-mono text-sm"
            />
          </div>
        </CardContent>
        <CardFooter className="flex justify-between">
          <div className="text-sm text-muted-foreground">
            {hasChanges() ? (
              <span className="text-amber-500">Unsaved changes</span>
            ) : (
              <span>Up to date</span>
            )}
          </div>
          <Button onClick={handleSave} disabled={isSaving || !hasChanges()}>
            <Save className="mr-2 h-4 w-4" />
            {isSaving ? 'Saving...' : 'Save Changes'}
          </Button>
        </CardFooter>
      </Card>

      <div className="grid gap-4 sm:grid-cols-3">
        {FILE_CONFIGS.map((file) => (
          <Card
            key={file.id}
            className={`cursor-pointer transition-colors ${
              selectedFile === file.id ? 'border-primary' : ''
            }`}
            onClick={() => handleFileChange(file.id)}
          >
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                    selectedFile === file.id ? 'bg-primary/10' : 'bg-muted'
                  }`}
                >
                  {file.icon}
                </div>
                <div>
                  <p className="font-medium">{file.name}</p>
                  <p className="text-xs text-muted-foreground line-clamp-1">
                    {file.description}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
