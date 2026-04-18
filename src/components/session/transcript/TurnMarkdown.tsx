"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface Props {
  content: string;
}

export function TurnMarkdown({ content }: Props) {
  return (
    <div
      className="prose-turn text-sm leading-relaxed text-[var(--color-text-primary)] [max-width:72ch]
        [&_p]:my-2 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0
        [&_h1]:mb-2 [&_h1]:mt-4 [&_h1]:font-display [&_h1]:text-lg
        [&_h2]:mb-2 [&_h2]:mt-4 [&_h2]:font-display [&_h2]:text-base
        [&_h3]:mb-1 [&_h3]:mt-3 [&_h3]:font-display [&_h3]:text-[15px]
        [&_h4]:mb-1 [&_h4]:mt-2 [&_h4]:font-display [&_h4]:text-sm
        [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5
        [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5
        [&_li]:my-0.5
        [&_strong]:font-semibold [&_strong]:text-[var(--color-text-primary)]
        [&_em]:italic
        [&_hr]:my-4 [&_hr]:border-[var(--color-border-subtle)]
        [&_blockquote]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:border-[var(--color-border-subtle)] [&_blockquote]:pl-3 [&_blockquote]:text-[var(--color-text-muted)]
        [&_code]:rounded [&_code]:bg-[var(--color-surface-raised)] [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[12px]
        [&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:border [&_pre]:border-[var(--color-border-subtle)] [&_pre]:bg-[var(--color-surface-raised)] [&_pre]:p-3
        [&_pre_code]:bg-transparent [&_pre_code]:p-0
        [&_a]:text-[var(--color-spot-warm)] [&_a]:underline [&_a]:underline-offset-2"
    >
      {/* SECURITY: do NOT add `rehype-raw` or any plugin that re-enables raw
          HTML rendering without a full XSS re-audit. react-markdown's default
          sanitizer blocks `javascript:` URLs and unknown elements — turn ids
          are not model-controlled but `content` is, and a prompt-injection
          could place hostile HTML if raw passthrough is added. */}
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}
