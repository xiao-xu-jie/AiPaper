import { marked } from 'marked';
import hljs from 'highlight.js';
import katex from 'katex';
import renderMathInElement from 'katex/contrib/auto-render';
import { getAssetUrl } from './store.js';

marked.setOptions({
  breaks: false,
  gfm: true,
});

const renderer = new marked.Renderer();
renderer.code = ({ text, lang }) => {
  if (lang && hljs.getLanguage(lang)) {
    try {
      return `<pre><code class="hljs language-${lang}">${hljs.highlight(text, { language: lang }).value}</code></pre>`;
    } catch { /* noop */ }
  }
  return `<pre><code>${text}</code></pre>`;
};
marked.use({ renderer });

export async function resolveImages(container, paperId) {
  const imgs = container.querySelectorAll('img');
  await Promise.all([...imgs].map(async (img) => {
    const src = img.getAttribute('src') || '';
    if (/^(https?:|data:|blob:)/i.test(src)) return;
    const rel = src.replace(/^\.?\//, '');
    const url = await getAssetUrl(paperId, rel);
    if (url) { img.src = url; img.dataset.objectUrl = url; }
    else img.alt = `[缺失图片] ${rel}`;
    img.loading = 'lazy';
  }));
}

function renderMath(container) {
  try {
    renderMathInElement(container, {
      delimiters: [
        { left: '$$', right: '$$', display: true },
        { left: '$', right: '$', display: false },
        { left: '\\(', right: '\\)', display: false },
        { left: '\\[', right: '\\]', display: true },
      ],
      throwOnError: false,
    });
  } catch { /* noop */ }
}

export async function renderMarkdown(container, mdText, paperId) {
  container.querySelectorAll('img[data-object-url]').forEach((img) => {
    try { URL.revokeObjectURL(img.dataset.objectUrl); } catch { /* noop */ }
  });
  container.innerHTML = marked.parse(mdText);
  await resolveImages(container, paperId);
  renderMath(container);
}

export function parseMarkdown(mdText) {
  return marked.parse(mdText);
}

function renderKatexExpression(source, displayMode) {
  try {
    return katex.renderToString(source, {
      displayMode,
      throwOnError: false,
      strict: false,
    });
  } catch {
    return null;
  }
}

export function parseMarkdownWithMath(mdText) {
  const codeBlocks = [];
  const mathBlocks = [];
  const codeToken = (idx) => `@@AIPAPER_CODE_${idx}@@`;
  const mathToken = (idx) => `@@AIPAPER_MATH_${idx}@@`;

  let masked = String(mdText || '').replace(/(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`)/g, (match) => {
    const idx = codeBlocks.push(match) - 1;
    return codeToken(idx);
  });

  function stashMath(source, displayMode, fallback) {
    const html = renderKatexExpression(source.trim(), displayMode);
    if (!html) return fallback;
    const idx = mathBlocks.push(html) - 1;
    return mathToken(idx);
  }

  masked = masked
    .replace(/\$\$([\s\S]+?)\$\$/g, (match, source) => stashMath(source, true, match))
    .replace(/\\\[([\s\S]+?)\\\]/g, (match, source) => stashMath(source, true, match))
    .replace(/\\\(([\s\S]+?)\\\)/g, (match, source) => stashMath(source, false, match))
    .replace(/(^|[^\\$])\$([^\n$]+?)\$/g, (match, prefix, source) => {
      const html = stashMath(source, false, match);
      return html === match ? match : prefix + html;
    });

  masked = masked.replace(/@@AIPAPER_CODE_(\d+)@@/g, (_, idx) => codeBlocks[Number(idx)] || '');
  return marked.parse(masked).replace(/@@AIPAPER_MATH_(\d+)@@/g, (_, idx) => mathBlocks[Number(idx)] || '');
}

export { renderMath };
