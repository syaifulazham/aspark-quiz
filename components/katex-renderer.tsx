"use client";

import { useMemo } from "react";
import { renderMathInText } from "@/lib/katex";

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
