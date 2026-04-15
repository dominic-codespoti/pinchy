'use client';

import type { AnchorHTMLAttributes, HTMLAttributes } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/shared/lib/utils';

interface MarkdownContentProps {
  content: string;
  className?: string;
  invert?: boolean;
}

const markdownComponents: Components = {
  p: ({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) => (
    <p className={cn('leading-7 [&:not(:first-child)]:mt-4', className)} {...props} />
  ),
  ul: ({ className, ...props }: HTMLAttributes<HTMLUListElement>) => (
    <ul className={cn('my-4 ml-6 list-disc space-y-2', className)} {...props} />
  ),
  ol: ({ className, ...props }: HTMLAttributes<HTMLOListElement>) => (
    <ol className={cn('my-4 ml-6 list-decimal space-y-2', className)} {...props} />
  ),
  li: ({ className, ...props }: HTMLAttributes<HTMLLIElement>) => (
    <li className={cn('pl-1', className)} {...props} />
  ),
  blockquote: ({ className, ...props }: HTMLAttributes<HTMLQuoteElement>) => (
    <blockquote className={cn('my-4 border-l-2 border-border/80 pl-4 italic', className)} {...props} />
  ),
  a: ({ className, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a
      className={cn('font-medium underline underline-offset-4', className)}
      target="_blank"
      rel="noreferrer noopener"
      {...props}
    />
  ),
  pre: ({ className, ...props }: HTMLAttributes<HTMLPreElement>) => (
    <pre
      className={cn(
        'my-4 overflow-x-auto rounded-md border border-border/60 bg-background/70 px-3 py-2 text-sm',
        className
      )}
      {...props}
    />
  ),
  code: ({ className, children, ...props }) => {
    const isBlock = typeof className === 'string' && className.includes('language-');

    return (
      <code
        className={cn(
          'font-mono text-[0.875em]',
          !isBlock && 'rounded bg-background/70 px-1.5 py-0.5',
          className
        )}
        {...props}
      >
        {children}
      </code>
    );
  },
};

export function MarkdownContent({ content, className, invert = false }: MarkdownContentProps) {
  return (
    <div
      className={cn(
        'text-sm break-words [&_table]:my-4 [&_table]:w-full [&_table]:border-collapse [&_th]:border [&_th]:border-border/60 [&_th]:bg-muted/40 [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_td]:border [&_td]:border-border/60 [&_td]:px-3 [&_td]:py-2 [&_hr]:my-4 [&_hr]:border-border/60',
        invert && '[&_a]:text-primary-foreground [&_blockquote]:border-primary-foreground/40 [&_code]:bg-black/10 [&_pre]:border-white/10 [&_pre]:bg-black/10',
        className
      )}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
