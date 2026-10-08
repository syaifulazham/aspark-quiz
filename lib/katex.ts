import katex from "katex";

/**
 * Renders text with inline KaTeX math delimiters to an HTML string: $...$ for inline, $$...$$ for block.
 * Non-math text is HTML-escaped. Safe to call on the server and the client.
 */
export function renderMathInText(text: string): string {
  if (!text) return "";

  const parts: string[] = [];
  const mathRegex = /\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g;
  let match: RegExpExecArray | null;
  let lastIndex = 0;

  while ((match = mathRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(escapeHtml(text.slice(lastIndex, match.index)));
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
      parts.push(escapeHtml(match[0]));
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(escapeHtml(text.slice(lastIndex)));
  }

  return parts.join("");
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
