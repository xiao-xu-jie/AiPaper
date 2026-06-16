// render.js —— Markdown 渲染：图片相对路径替换 + 公式 + 代码高亮
// 依赖全局：marked、hljs、katex、renderMathInElement（CDN 引入）
import { getAssetUrl } from './store.js';

// 配置 marked：代码高亮
function configureMarked() {
  if (!window.__markedConfigured && window.marked) {
    window.marked.setOptions({
      breaks: false,
      gfm: true,
      highlight(code, lang) {
        if (window.hljs && lang && window.hljs.getLanguage(lang)) {
          try { return window.hljs.highlight(code, { language: lang }).value; } catch { /* noop */ }
        }
        return code;
      },
    });
    window.__markedConfigured = true;
  }
}

// 把 markdown 中的相对图片路径换成本地资源的 object URL
async function resolveImages(container, paperId) {
  const imgs = container.querySelectorAll('img');
  await Promise.all([...imgs].map(async (img) => {
    const src = img.getAttribute('src') || '';
    // 跳过绝对地址
    if (/^(https?:|data:|blob:)/i.test(src)) return;
    const rel = src.replace(/^\.?\//, '');
    const url = await getAssetUrl(paperId, rel);
    if (url) {
      img.src = url;
      img.dataset.objectUrl = url; // 便于后续 revoke
    } else {
      img.alt = `[缺失图片] ${rel}`;
    }
    img.loading = 'lazy';
  }));
}

// 渲染公式（KaTeX auto-render）
function renderMath(container) {
  if (window.renderMathInElement) {
    try {
      window.renderMathInElement(container, {
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
}

// 主入口：把 markdown 文本渲染进 container
export async function renderMarkdown(container, mdText, paperId) {
  configureMarked();
  // 先释放上一次的 object URL
  container.querySelectorAll('img[data-object-url]').forEach((img) => {
    try { URL.revokeObjectURL(img.dataset.objectUrl); } catch { /* noop */ }
  });
  container.innerHTML = window.marked ? window.marked.parse(mdText) : mdText;
  await resolveImages(container, paperId);
  renderMath(container);
}
