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

const imageObservers = new WeakMap();
const idleMathTasks = new WeakMap();
const TRANSPARENT_PLACEHOLDER = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';
const LARGE_MARKDOWN_LENGTH = 180000;

function cleanupRenderedResources(container) {
  const observer = imageObservers.get(container);
  if (observer) {
    observer.disconnect();
    imageObservers.delete(container);
  }
  const idleTask = idleMathTasks.get(container);
  if (idleTask) {
    if (idleTask.type === 'idle') cancelIdleCallback(idleTask.id);
    else cancelAnimationFrame(idleTask.id);
    idleMathTasks.delete(container);
  }
  container.querySelectorAll('img[data-object-url]').forEach((img) => {
    try { URL.revokeObjectURL(img.dataset.objectUrl); } catch { /* noop */ }
    delete img.dataset.objectUrl;
  });
}

async function loadLocalImage(img, paperId) {
  if (!img?.dataset?.assetRel || img.dataset.loadingAsset === '1') return;
  img.dataset.loadingAsset = '1';
  const rel = img.dataset.assetRel;
  const url = await getAssetUrl(paperId, rel);
  if (url) {
    img.src = url;
    img.dataset.objectUrl = url;
    img.classList.remove('lazy-image-pending');
    delete img.dataset.assetRel;
  } else {
    img.alt = `[缺失图片] ${rel}`;
    img.classList.remove('lazy-image-pending');
  }
  delete img.dataset.loadingAsset;
}

async function resolveImagesEager(imgs, paperId) {
  const queue = [...imgs];
  const workers = Array.from({ length: Math.min(4, queue.length) }, async () => {
    while (queue.length) {
      const img = queue.shift();
      await loadLocalImage(img, paperId);
    }
  });
  await Promise.all(workers);
}

export async function resolveImages(container, paperId, { lazy = true } = {}) {
  const imgs = [...container.querySelectorAll('img')];
  const localImgs = [];

  for (const img of imgs) {
    const src = img.getAttribute('src') || '';
    if (/^(https?:|data:|blob:)/i.test(src)) {
      img.loading = 'lazy';
      continue;
    }
    const rel = src.replace(/^\.?\//, '');
    img.dataset.assetRel = rel;
    img.dataset.originalSrc = src;
    img.classList.add('lazy-image-pending');
    img.loading = 'lazy';
    localImgs.push(img);
  }

  if (!localImgs.length) return;

  if (!lazy || typeof IntersectionObserver !== 'function') {
    await resolveImagesEager(localImgs, paperId);
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      observer.unobserve(entry.target);
      loadLocalImage(entry.target, paperId).catch(() => {});
    });
  }, { root: container, rootMargin: '900px 0px' });

  imageObservers.set(container, observer);
  localImgs.forEach((img, index) => {
    img.src = TRANSPARENT_PLACEHOLDER;
    observer.observe(img);
    if (index < 4) loadLocalImage(img, paperId).catch(() => {});
  });
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

function scheduleMathRender(container) {
  const run = () => {
    idleMathTasks.delete(container);
    if (!container.isConnected) return;
    renderMath(container);
  };
  if (typeof requestIdleCallback === 'function') {
    const id = requestIdleCallback(run, { timeout: 1200 });
    idleMathTasks.set(container, { type: 'idle', id });
  } else {
    const id = requestAnimationFrame(run);
    idleMathTasks.set(container, { type: 'frame', id });
  }
}

export async function renderMarkdown(container, mdText, paperId) {
  cleanupRenderedResources(container);
  container.innerHTML = marked.parse(mdText);
  await resolveImages(container, paperId);
  if (String(mdText || '').length > LARGE_MARKDOWN_LENGTH) scheduleMathRender(container);
  else renderMath(container);
}

export function cleanupMarkdownRender(container) {
  if (container) cleanupRenderedResources(container);
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
