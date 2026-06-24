<template>
  <div class="figures-wrap">
    <div class="figures-toolbar">
      <div class="figures-summary">
        <strong>{{ figures.length }}</strong>
        <span>张图表</span>
        <span v-if="referencedCount">，{{ referencedCount }} 张来自正文引用</span>
      </div>
      <input
        v-model="query"
        class="figures-search"
        type="search"
        placeholder="搜索图名、章节、说明..."
      />
      <div class="figures-filter">
        <button :class="{ active: filter === 'all' }" @click="filter = 'all'">全部</button>
        <button :class="{ active: filter === 'referenced' }" @click="filter = 'referenced'">正文引用</button>
        <button :class="{ active: filter === 'unreferenced' }" @click="filter = 'unreferenced'">未引用</button>
      </div>
      <button class="btn small" :disabled="loading" @click="reload">刷新</button>
    </div>

    <div v-if="loading" class="figures-empty">正在读取图表资源...</div>
    <div v-else-if="!papers.currentId" class="figures-empty">选择一篇论文后查看图表库</div>
    <div v-else-if="!figures.length" class="figures-empty">当前论文没有可展示的图片资源</div>
    <div v-else-if="!filteredFigures.length" class="figures-empty">没有匹配的图表</div>

    <div v-else class="figures-grid">
      <article
        v-for="figure in filteredFigures"
        :key="figure.path"
        class="figure-card"
      >
        <button class="figure-thumb" @click="openPreview(figure)">
          <img :src="figure.url" :alt="figure.alt || figure.name" loading="lazy" />
        </button>
        <div class="figure-meta">
          <div class="figure-title" :title="figure.caption || figure.alt || figure.name">
            {{ figure.caption || figure.alt || figure.name }}
          </div>
          <div class="figure-path" :title="figure.path">{{ figure.path }}</div>
          <div class="figure-extra">
            <span v-if="figure.section">{{ figure.section }}</span>
            <span>{{ formatBytes(figure.size) }}</span>
          </div>
        </div>
        <div class="figure-actions">
          <button title="复制图片" @click="copyImage(figure)">复制图片</button>
          <button title="复制 Markdown 引用" @click="copyMarkdown(figure)">复制引用</button>
          <button title="向 AI 提问此图" @click="askFigure(figure)">问 AI</button>
          <button v-if="figure.referenced" title="定位到 Markdown 正文" @click="$emit('locateFigure', figure.path)">定位正文</button>
          <button title="下载图片" @click="downloadFigure(figure)">下载</button>
        </div>
      </article>
    </div>

    <Teleport to="body">
      <div v-if="preview.show" class="figure-preview" @click="closePreview">
        <div class="figure-preview-panel" @click.stop>
          <div class="figure-preview-head">
            <div>
              <h3>{{ preview.figure?.caption || preview.figure?.alt || preview.figure?.name }}</h3>
              <p>{{ preview.figure?.path }}</p>
            </div>
            <button class="preview-close" @click="closePreview">✕</button>
          </div>
          <div class="figure-preview-body">
            <img :src="preview.figure?.url" :alt="preview.figure?.alt || preview.figure?.name" />
          </div>
          <div class="figure-preview-actions">
            <button class="btn small" @click="copyImage(preview.figure)">复制图片</button>
            <button class="btn small" @click="copyMarkdown(preview.figure)">复制引用</button>
            <button class="btn small" @click="askFigure(preview.figure)">问 AI</button>
            <button class="btn small" @click="downloadFigure(preview.figure)">下载</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { computed, inject, onUnmounted, reactive, ref, watch } from 'vue';
import { usePapersStore } from '../stores/papers.js';
import * as store from '../lib/store.js';

const emit = defineEmits(['askImage', 'locateFigure']);
const papers = usePapersStore();
const toast = inject('toast', () => {});

const loading = ref(false);
const figures = ref([]);
const query = ref('');
const filter = ref('all');
const preview = reactive({ show: false, figure: null });
let loadSeq = 0;

const referencedCount = computed(() => figures.value.filter((figure) => figure.referenced).length);

const filteredFigures = computed(() => {
  const q = query.value.trim().toLowerCase();
  return figures.value.filter((figure) => {
    if (filter.value === 'referenced' && !figure.referenced) return false;
    if (filter.value === 'unreferenced' && figure.referenced) return false;
    if (!q) return true;
    return [
      figure.name,
      figure.path,
      figure.alt,
      figure.caption,
      figure.section,
    ].some((text) => String(text || '').toLowerCase().includes(q));
  });
});

function normalizePath(path) {
  let text = String(path || '').trim().replace(/^<|>$/g, '');
  text = text.split(/[?#]/)[0].replace(/\\/g, '/').replace(/^\.?\//, '');
  try { text = decodeURIComponent(text); } catch { /* keep original */ }
  return text;
}

function stripMarkdown(text) {
  return String(text || '')
    .replace(/!\[[^\]]*\]\([^)]+\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_`>#|]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitImageTarget(rawTarget) {
  const raw = String(rawTarget || '').trim();
  if (raw.startsWith('<')) return raw.replace(/^<|>$/g, '');
  const titleIndex = raw.search(/\s+["']/);
  return titleIndex >= 0 ? raw.slice(0, titleIndex).trim() : raw;
}

function isCaptionLike(text) {
  const clean = stripMarkdown(text);
  if (!clean || clean.length > 220) return false;
  return /^(fig\.?|figure|图|表|table|caption)[:：\s\d.-]/i.test(clean)
    || /^(如图|见图|shown in|as shown)/i.test(clean);
}

function findNearbyCaption(lines, index, alt) {
  const cleanAlt = stripMarkdown(alt);
  if (cleanAlt && !/^image$/i.test(cleanAlt)) return cleanAlt;

  for (const offset of [1, -1, 2, -2]) {
    const line = lines[index + offset];
    if (line === undefined) continue;
    if (isCaptionLike(line)) return stripMarkdown(line);
  }
  return '';
}

function extractMarkdownFigures(markdown) {
  const refs = new Map();
  const lines = String(markdown || '').split(/\r?\n/);
  let section = '';
  let order = 0;

  lines.forEach((line, index) => {
    const heading = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (heading) {
      section = stripMarkdown(heading[2]);
      return;
    }

    const pattern = /!\[([^\]]*)\]\(([^)]+)\)/g;
    let match;
    while ((match = pattern.exec(line))) {
      const target = splitImageTarget(match[2]);
      if (/^(https?:|data:|blob:)/i.test(target)) continue;
      const path = normalizePath(target);
      if (!path) continue;
      const alt = stripMarkdown(match[1]);
      if (!refs.has(path)) {
        refs.set(path, {
          alt,
          caption: findNearbyCaption(lines, index, alt),
          section,
          order: order++,
          line: index + 1,
        });
      }
    }
  });

  return refs;
}

function isImageAsset(asset) {
  const type = asset.file?.type || '';
  if (type.startsWith('image/')) return true;
  return /\.(png|jpe?g|webp|gif|bmp|tiff?|svg)$/i.test(asset.path);
}

function makeFigure(asset, refMeta, fallbackOrder) {
  const path = normalizePath(asset.path);
  const name = path.split('/').pop() || path;
  return {
    path,
    name,
    file: asset.file,
    url: URL.createObjectURL(asset.file),
    size: asset.file?.size || 0,
    type: asset.file?.type || '',
    alt: refMeta?.alt || '',
    caption: refMeta?.caption || '',
    section: refMeta?.section || '',
    line: refMeta?.line || null,
    order: refMeta?.order ?? fallbackOrder,
    referenced: Boolean(refMeta),
  };
}

function revokeFigures() {
  for (const figure of figures.value) {
    try { URL.revokeObjectURL(figure.url); } catch { /* noop */ }
  }
  figures.value = [];
}

async function loadFigures(paperId) {
  const seq = ++loadSeq;
  revokeFigures();
  preview.show = false;
  preview.figure = null;
  if (!paperId) return;

  loading.value = true;
  try {
    const [markdown, assets] = await Promise.all([
      store.loadMarkdown(paperId).catch(() => ''),
      store.listPaperAssets(paperId).catch(() => []),
    ]);
    if (seq !== loadSeq || papers.currentId !== paperId) return;
    const refs = extractMarkdownFigures(markdown);
    const next = assets
      .filter(isImageAsset)
      .map((asset, index) => {
        const path = normalizePath(asset.path);
        return makeFigure(asset, refs.get(path), index + refs.size + 1);
      })
      .sort((a, b) => a.order - b.order || a.path.localeCompare(b.path));
    figures.value = next;
  } catch (e) {
    toast('读取图表失败：' + (e?.message || e), 'error');
  } finally {
    if (seq === loadSeq) loading.value = false;
  }
}

function reload() {
  loadFigures(papers.currentId);
}

function formatBytes(bytes) {
  if (!bytes) return '未知大小';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function markdownForFigure(figure) {
  if (!figure) return '';
  const alt = figure.alt || figure.caption || figure.name;
  return `![${alt}](${figure.path})`;
}

function openPreview(figure) {
  preview.figure = figure;
  preview.show = true;
}

function closePreview() {
  preview.show = false;
  preview.figure = null;
}

async function copyMarkdown(figure) {
  if (!figure) return;
  await navigator.clipboard.writeText(markdownForFigure(figure));
  toast('已复制 Markdown 引用', 'success');
}

async function copyImage(figure) {
  if (!figure) return;
  try {
    const type = figure.file?.type || figure.type || 'image/png';
    if (window.ClipboardItem && type.startsWith('image/') && type !== 'image/svg+xml') {
      try {
        await navigator.clipboard.write([new ClipboardItem({ [type]: figure.file })]);
        toast('已复制图片', 'success');
        return;
      } catch { /* fall back to canvas */ }
    }

    const image = new Image();
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = reject;
      image.src = figure.url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth || image.width;
    canvas.height = image.naturalHeight || image.height;
    canvas.getContext('2d').drawImage(image, 0, 0);
    const pngBlob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob })]);
    toast('已复制图片', 'success');
  } catch (e) {
    toast('复制图片失败：' + (e?.message || e), 'error');
  }
}

async function askFigure(figure) {
  if (!figure) return;
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => resolve(event.target.result);
    reader.onerror = reject;
    reader.readAsDataURL(figure.file);
  });
  emit('askImage', dataUrl);
}

function downloadFigure(figure) {
  if (!figure) return;
  const a = document.createElement('a');
  a.href = figure.url;
  a.download = figure.name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

watch(() => papers.currentId, loadFigures, { immediate: true });

onUnmounted(() => {
  loadSeq++;
  revokeFigures();
});
</script>

<style scoped>
.figures-wrap {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  background: #fff;
}
.figures-toolbar {
  display: grid;
  grid-template-columns: minmax(120px, 1fr) minmax(180px, 320px) auto auto;
  gap: 10px;
  align-items: center;
  padding: 12px 20px;
  border-bottom: 1px solid var(--border);
  background: var(--panel);
  flex-shrink: 0;
}
.figures-summary {
  min-width: 0;
  color: var(--muted);
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.figures-summary strong {
  color: var(--text);
  margin-right: 4px;
}
.figures-search {
  width: 100%;
  height: 32px;
  padding: 0 10px;
  border: 1px solid var(--border);
  border-radius: 7px;
  background: #fff;
  color: var(--text);
  font-size: 13px;
  outline: none;
}
.figures-search:focus {
  border-color: var(--primary);
}
.figures-filter {
  display: inline-flex;
  gap: 3px;
  padding: 3px;
  border-radius: 8px;
  background: #eef0f2;
}
.figures-filter button {
  border: none;
  background: transparent;
  padding: 5px 10px;
  border-radius: 6px;
  color: var(--muted);
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
}
.figures-filter button.active {
  background: #fff;
  color: var(--text);
  box-shadow: var(--shadow);
}
.figures-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--muted);
  font-size: 14px;
}
.figures-grid {
  flex: 1;
  overflow-y: auto;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 14px;
  padding: 18px 20px 28px;
  align-content: start;
}
.figure-card {
  display: flex;
  flex-direction: column;
  min-width: 0;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: #fff;
  overflow: hidden;
  box-shadow: 0 1px 3px rgba(0,0,0,.04);
}
.figure-thumb {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  aspect-ratio: 4 / 3;
  border: none;
  border-bottom: 1px solid var(--border);
  background: #f7f8fa;
  cursor: zoom-in;
  padding: 10px;
}
.figure-thumb img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}
.figure-meta {
  padding: 10px 11px 8px;
  min-width: 0;
}
.figure-title {
  color: var(--text);
  font-size: 13px;
  font-weight: 600;
  line-height: 1.35;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.figure-path {
  margin-top: 5px;
  color: var(--muted);
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.figure-extra {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-top: 7px;
  color: var(--muted);
  font-size: 11px;
}
.figure-extra span {
  max-width: 100%;
  padding: 2px 6px;
  border-radius: 4px;
  background: #f0f1f3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.figure-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 0 11px 11px;
  margin-top: auto;
}
.figure-actions button {
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--panel);
  color: var(--muted);
  cursor: pointer;
  font-size: 12px;
  padding: 4px 8px;
}
.figure-actions button:hover {
  background: #f0f1f3;
  color: var(--text);
}
.figure-preview {
  position: fixed;
  inset: 0;
  z-index: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 22px;
  background: rgba(0,0,0,.72);
}
.figure-preview-panel {
  width: min(1100px, 96vw);
  max-height: 94vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: 8px;
  background: #fff;
  box-shadow: 0 16px 48px rgba(0,0,0,.28);
}
.figure-preview-head {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 14px 18px;
  border-bottom: 1px solid var(--border);
}
.figure-preview-head h3 {
  margin: 0;
  color: var(--text);
  font-size: 15px;
  line-height: 1.4;
}
.figure-preview-head p {
  margin: 5px 0 0;
  color: var(--muted);
  font-size: 12px;
}
.preview-close {
  margin-left: auto;
  border: none;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  border-radius: 6px;
  padding: 4px 8px;
  font-size: 18px;
}
.preview-close:hover {
  background: #f0f1f3;
  color: var(--text);
}
.figure-preview-body {
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 18px;
  overflow: auto;
  background: #f7f8fa;
}
.figure-preview-body img {
  max-width: 100%;
  max-height: 72vh;
  object-fit: contain;
}
.figure-preview-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 18px;
  border-top: 1px solid var(--border);
}
</style>
