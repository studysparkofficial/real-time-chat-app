import DOMPurify from 'dompurify';

/**
 * Enterprise XSS Sanitization Service
 * Ensures zero script execution, sanitizes markdown outputs and rich text HTML
 */

// Configure default DOMPurify profile
const PURIFY_CONFIG = {
  ALLOWED_TAGS: [
    'p', 'br', 'strong', 'b', 'em', 'i', 'code', 'pre', 'span',
    'a', 'blockquote', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'table', 'thead', 'tbody', 'tr', 'th', 'td'
  ],
  ALLOWED_ATTR: ['href', 'title', 'target', 'rel', 'class', 'data-code'],
  ALLOW_DATA_ATTR: false,
};

/**
 * Sanitize raw HTML string
 */
export function sanitizeHtml(dirty: string): string {
  if (!dirty) return '';
  return DOMPurify.sanitize(dirty, PURIFY_CONFIG);
}

/**
 * Escape raw text for safe DOM display
 */
export function escapeText(text: string): string {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Lightweight, high-performance Markdown parser with full XSS sanitization
 * Supports:
 * - Fenced code blocks ```lang\ncode\n```
 * - Inline code `code`
 * - Bold **text** or __text__
 * - Italic *text* or _text_
 * - Strikethrough ~~text~~
 * - Safe auto-linking http/https URLs with rel="noopener noreferrer"
 */
export function renderMarkdownToSafeHtml(content: string): string {
  if (!content) return '';

  // Extract code blocks first to protect code contents from markdown substitution
  const codeBlocks: string[] = [];
  let processed = content.replace(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g, (_, lang, code) => {
    const placeholder = `__CODE_BLOCK_${codeBlocks.length}__`;
    const safeLang = escapeText(lang || 'code');
    const safeCode = escapeText(code.trim());
    codeBlocks.push(
      `<div class="markdown-code-block">` +
        `<div class="markdown-code-header">` +
          `<span>${safeLang}</span>` +
          `<button type="button" class="markdown-code-copy-btn" data-code="${safeCode}">Copy</button>` +
        `</div>` +
        `<pre><code>${safeCode}</code></pre>` +
      `</div>`
    );
    return placeholder;
  });

  // Inline code `code`
  processed = processed.replace(/`([^`]+)`/g, (_, inline) => {
    return `<code>${escapeText(inline)}</code>`;
  });

  // URLs
  processed = processed.replace(
    /(https?:\/\/[^\s<]+[^<.,:;"')\]\s])/g,
    '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>'
  );

  // Bold **text**
  processed = processed.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  processed = processed.replace(/__(.*?)__/g, '<strong>$1</strong>');

  // Italic *text*
  processed = processed.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  processed = processed.replace(/_([^_]+)_/g, '<em>$1</em>');

  // Strikethrough
  processed = processed.replace(/~~(.*?)~~/g, '<del>$1</del>');

  // Newlines into <br />
  processed = processed.replace(/\n/g, '<br />');

  // Re-inject code blocks
  codeBlocks.forEach((block, idx) => {
    processed = processed.replace(`__CODE_BLOCK_${idx}__`, block);
  });

  // Final DOMPurify pass
  return sanitizeHtml(processed);
}
