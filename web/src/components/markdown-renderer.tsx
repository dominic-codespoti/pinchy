import { createMemo } from "solid-js";
import { marked } from "marked";

// Configure marked for safe rendering
marked.setOptions({
  breaks: true,
  gfm: true,
});

interface MarkdownRendererProps {
  readonly content: string;
  readonly class?: string;
}

export function MarkdownRenderer(props: MarkdownRendererProps) {
  const html = createMemo(() => {
    try {
      return marked.parse(props.content, { async: false }) as string;
    } catch {
      return props.content;
    }
  });

  return (
    <div
      class={`markdown-body ${props.class ?? ""}`}
      innerHTML={html()}
    />
  );
}
