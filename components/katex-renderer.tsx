"use client";

import { useMemo } from "react";
import katex from "katex";

interface Props {
  text: string;
  className?: string;
}

/**
 * Renders text with inline KaTeX math delimiters: $...$ for inline, $$...$$ for block.
 * Non-math text is rendered as-is.
 */
export function KaTeXRenderer({ text, className }: Props) {
  const html = useMemo(() => renderMathInText(text), [text]);
  return <span className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}

function renderMathInText(text: string): string {
  if (!text) return "";

  // Split on $$...$$ (display) and $...$ (inline)
  // Process display math first, then inline
  const parts: string[] = [];
  const remaining = text;

  // Pattern: $$...$$ for display, $...$ for inline (non-greedy)
  const mathRegex = /\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g;
  let match: RegExpExecArray | null;
  let lastIndex = 0;

  while ((match = mathRegex.exec(remaining)) !== null) {
    // Add text before match
    if (match.index > lastIndex) {
      parts.push(escapeHtml(remaining.slice(lastIndex, match.index)));
    }

    const displayMath = match[1];
    const inlineMath = match[2];

    try {
      if (displayMath !== undefined) {
        parts.push(katex.renderToString(displayMath, { displayMode: true, throwOnError: false }));
      } else if (inlineMath !== undefined) {
        parts.push(katex.renderToString(inlineMath, { displayMode: false, throwOnError: false }));
      }
    } catch {
      // If KaTeX fails, show raw text
      parts.push(escapeHtml(match[0]));
    }

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < remaining.length) {
    parts.push(escapeHtml(remaining.slice(lastIndex)));
  }

  return parts.join("");
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
