import { marked } from 'marked';
import hljs from 'highlight.js';
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

async function resolveImages(container, paperId) {
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

export { renderMath };
