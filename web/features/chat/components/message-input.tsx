'use client';

import { useCallback, useRef } from 'react';
import { Send, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

interface MessageInputProps {
  onSend: (message: string) => void;
  value: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
  isWorking?: boolean;
  placeholder?: string;
  textareaRef?: React.Ref<HTMLTextAreaElement>;
}

export function MessageInput({
  onSend,
  value,
  onValueChange,
  disabled,
  isWorking = false,
  placeholder = 'Type a message...',
  textareaRef,
}: MessageInputProps) {
  const internalTextareaRef = useRef<HTMLTextAreaElement>(null);
  const resolvedTextareaRef = textareaRef ?? internalTextareaRef;

  const handleSend = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    onValueChange('');
  }, [value, disabled, onSend, onValueChange]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex gap-2">
      <Textarea
        ref={resolvedTextareaRef}
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        className="min-h-[44px] max-h-[200px] resize-none"
        rows={1}
      />
      <Button onClick={handleSend} disabled={!value.trim() || disabled} size="icon">
        {isWorking ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
      </Button>
    </div>
  );
}
