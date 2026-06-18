<template>
  <section class="viewer">
    <div class="viewer-head">
      <h1 class="viewer-title">{{ title }}</h1>
      <div class="view-tabs">
        <button class="tab" :class="{ active: view === 'md' }" @click="view = 'md'">Markdown</button>
        <button class="tab" :class="{ active: view === 'pdf' }" @click="view = 'pdf'">原文 PDF</button>
        <button class="tab" :class="{ active: view === 'notes' }" @click="view = 'notes'">
          阅读笔记<span v-if="papers.noteGeneratingFor === papers.currentId" class="tab-badge">●</span>
        </button>
      </div>
      <button class="btn small" @click="$emit('toggleChat')">💬 AI 助手</button>
    </div>

    <div v-if="paper && paper.state !== 'done'" class="status-bar" :class="{ failed: paper.state === 'failed' }">
      <span>{{ paper.stateText || paper.state }}</span>
      <div class="progress"><div class="progress-fill" :style="{ width: (paper.progress || 0) + '%' }" /></div>
    </div>

    <div class="viewer-body">
      <aside v-if="view === 'md' && showOutline && outline.length" class="outline-panel">
        <div class="outline-header">
          <span>目录</span>
          <button class="outline-toggle" @click="showOutline = false">✕</button>
        </div>
        <nav class="outline-nav">
          <a
            v-for="item in outline"
            :key="item.id"
            :class="['outline-item', `level-${item.level}`]"
            @click="scrollToHeading(item.id)"
          >{{ item.text }}</a>
        </nav>
      </aside>
      <button v-if="view === 'md' && !showOutline && outline.length" class="outline-show-btn" @click="showOutline = true">☰ 目录</button>
      <article v-show="view === 'md'" ref="mdBox" class="md-view markdown-body" @contextmenu="onContextMenu">
        <div v-if="!paper" class="placeholder">选择或上传一篇论文以查看解析结果</div>
        <div v-else-if="paper.state === 'failed'" class="placeholder error">解析失败：{{ paper.error }}</div>
        <div v-else-if="paper.state !== 'done'" class="placeholder">解析完成后将在此显示 Markdown 内容</div>
      </article>
      <div v-show="view === 'pdf'" class="pdf-wrap">
        <iframe ref="pdfFrame" title="PDF 预览" />
      </div>
      <NotesView v-show="view === 'notes'" @askImage="onNotesAskImage" @askText="onNotesAskText" />
    </div>
  </section>

  <!-- 自定义右键菜单 -->
  <Teleport to="body">
    <div v-if="ctxMenu.show" class="img-ctx-menu" :style="{ left: ctxMenu.x + 'px', top: ctxMenu.y + 'px' }" @click.stop>
      <button v-if="ctxMenu.src" @click="copyImageFromMenu">📋 复制图片</button>
      <button v-if="ctxMenu.src" @click="askAboutImage">💬 向 AI 提问此图</button>
      <button v-if="ctxMenu.text" @click="copyAsMarkdown">📋 复制为 Markdown</button>
      <button v-if="ctxMenu.text" @click="copyAsPlainText">📋 复制为纯文本</button>
      <button v-if="ctxMenu.text" @click="askAboutText">💬 向 AI 提问选中内容</button>
      <button v-if="ctxMenu.text" @click="translateSelection">🌐 翻译选中内容</button>
    </div>
    <div v-if="ctxMenu.show" class="ctx-backdrop" @click="ctxMenu.show = false" @contextmenu.prevent="ctxMenu.show = false" />

    <!-- 图片预览模态框 -->
    <div v-if="preview.show" class="preview-modal" @click="preview.show = false">
      <img :src="preview.src" alt="预览" @click.stop />
      <button class="copy-btn" @click.stop="copyImage">📋 复制图片</button>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, computed, reactive, onMounted } from 'vue';
import { usePapersStore } from '../stores/papers.js';
import { useConfigStore } from '../stores/config.js';
import { renderMarkdown, parseMarkdown } from '../lib/render.js';
import * as store from '../lib/store.js';
import * as agent from '../lib/agent.js';
import NotesView from './NotesView.vue';

const papers = usePapersStore();
const cfg = useConfigStore();
const emit = defineEmits(['toggleChat', 'askImage', 'askText']);
const view = ref('md');
const mdBox = ref(null);
const pdfFrame = ref(null);
const ctxMenu = reactive({ show: false, x: 0, y: 0, src: '', text: '' });
const preview = reactive({ show: false, src: '' });
const showOutline = ref(true);
const outline = ref([]);
const translations = ref([]);

const paper = computed(() => papers.currentPaper);
const title = computed(() => paper.value?.title || '未选择论文');

function extractOutline() {
  if (!mdBox.value) return [];
  const headings = mdBox.value.querySelectorAll('h1, h2, h3, h4, h5, h6');
  return [...headings].map((el, idx) => {
    const id = `heading-${idx}`;
    el.id = id;
    return {
      id,
      level: parseInt(el.tagName[1]),
      text: el.textContent.trim()
    };
  });
}

function scrollToHeading(id) {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// 组件挂载时（key变化后重建）直接加载当前论文
onMounted(async () => {
  const id = papers.currentId;
  if (!id) return;
  const md = await store.loadMarkdown(id).catch(() => null);
  if (md && mdBox.value && paper.value?.state === 'done') {
    await renderMarkdown(mdBox.value, md, id);
    mdBox.value.addEventListener('click', onImageClick);
    outline.value = extractOutline();
    translations.value = await store.loadTranslations(id).catch(() => []);
    restoreTranslationBlocks();
  }
  if (pdfFrame.value) {
    const url = await store.getPdfUrl(id).catch(() => null);
    pdfFrame.value.src = url || 'about:blank';
  }
});

function onImageClick(e) {
  if (e.target.tagName === 'IMG') {
    preview.src = e.target.src;
    preview.show = true;
  }
}

function onContextMenu(e) {
  const isImg = e.target.tagName === 'IMG';
  const selectedText = window.getSelection()?.toString().trim() || '';
  if (!isImg && !selectedText) return;
  e.preventDefault();
  ctxMenu.src = isImg ? e.target.src : '';
  ctxMenu.text = selectedText;
  ctxMenu.x = e.clientX;
  ctxMenu.y = e.clientY;
  ctxMenu.show = true;
}

function askAboutText() {
  ctxMenu.show = false;
  emit('askText', ctxMenu.text);
}

// ---------- 翻译 ----------
function findAnchorElement(selectedText) {
  if (!mdBox.value) return null;
  const walker = document.createTreeWalker(mdBox.value, NodeFilter.SHOW_TEXT, null);
  while (walker.nextNode()) {
    if (walker.currentNode.textContent.includes(selectedText)) {
      let el = walker.currentNode.parentElement;
      while (el && el !== mdBox.value && el.parentElement !== mdBox.value) {
        el = el.parentElement;
      }
      return el;
    }
  }
  return null;
}

function createTranslationBlock(trans) {
  const block = document.createElement('div');
  block.className = 'translation-block';
  block.dataset.id = trans.id;
  block.innerHTML = `
    <div class="translation-header">
      <span class="translation-label">🌐 翻译</span>
      <button class="translation-copy" title="复制译文">📋</button>
      <button class="translation-remove" title="删除翻译">✕</button>
    </div>
    <div class="translation-body"></div>
  `;
  block.querySelector('.translation-remove').addEventListener('click', () => removeTranslation(trans.id));
  block.querySelector('.translation-copy').addEventListener('click', () => {
    navigator.clipboard.writeText(trans.translation || '');
  });
  return block;
}

function renderTranslationBody(block, text) {
  const body = block.querySelector('.translation-body');
  body.innerHTML = parseMarkdown(text);
}

async function translateSelection() {
  ctxMenu.show = false;
  const selectedText = ctxMenu.text;
  if (!selectedText) return;
  if (!cfg.aiUrl || !cfg.aiModel) {
    emit('askText', '__toast:请先配置 AI 模型');
    return;
  }

  const anchor = findAnchorElement(selectedText);
  const id = 'tr_' + Date.now().toString(36);
  const trans = { id, anchorText: selectedText, translation: '', createdAt: Date.now() };
  const block = createTranslationBlock(trans);
  if (anchor && anchor.parentElement) {
    anchor.insertAdjacentElement('afterend', block);
  } else if (mdBox.value) {
    mdBox.value.appendChild(block);
  }
  block.querySelector('.translation-body').innerHTML = '<span class="cursor">翻译中...▌</span>';

  const prompt = `请将以下内容翻译为中文，保持学术准确性，保留专业术语和公式符号，只输出译文不要解释：\n\n${selectedText}`;
  try {
    let result = '';
    await agent.chat([], prompt, [], (chunk) => {
      result += chunk;
      renderTranslationBody(block, result + '<span class="cursor">▌</span>');
    });
    trans.translation = result;
    renderTranslationBody(block, result);
    translations.value.push(trans);
    await store.saveTranslations(papers.currentId, translations.value);
  } catch (e) {
    renderTranslationBody(block, `翻译失败：${e.message}`);
  }
}

function removeTranslation(id) {
  translations.value = translations.value.filter((t) => t.id !== id);
  store.saveTranslations(papers.currentId, translations.value).catch(() => {});
  const block = mdBox.value?.querySelector(`.translation-block[data-id="${id}"]`);
  if (block) block.remove();
}

function restoreTranslationBlocks() {
  if (!mdBox.value || !translations.value.length) return;
  translations.value.forEach((trans) => {
    const anchor = findAnchorElement(trans.anchorText);
    const block = createTranslationBlock(trans);
    renderTranslationBody(block, trans.translation);
    if (anchor && anchor.parentElement) {
      anchor.insertAdjacentElement('afterend', block);
    } else if (mdBox.value) {
      mdBox.value.appendChild(block);
    }
  });
}

async function askAboutImage() {
  ctxMenu.show = false;
  const src = ctxMenu.src;
  let dataUrl = src;
  if (!src.startsWith('data:')) {
    const res = await fetch(src);
    const blob = await res.blob();
    dataUrl = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (ev) => resolve(ev.target.result);
      reader.readAsDataURL(blob);
    });
  }
  emit('askImage', dataUrl);
}

async function copyImage() {
  try {
    const src = preview.src;
    const res = await fetch(src);
    const blob = await res.blob();
    const canvas = document.createElement('canvas');
    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = src;
    });
    canvas.width = img.width;
    canvas.height = img.height;
    canvas.getContext('2d').drawImage(img, 0, 0);
    canvas.toBlob(async (pngBlob) => {
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': pngBlob })
      ]);
      preview.show = false;
    }, 'image/png');
  } catch (e) {
    alert('复制失败：' + e.message);
  }
}

async function copyImageFromMenu() {
  ctxMenu.show = false;
  try {
    const src = ctxMenu.src;
    const res = await fetch(src);
    const blob = await res.blob();
    const canvas = document.createElement('canvas');
    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = src;
    });
    canvas.width = img.width;
    canvas.height = img.height;
    canvas.getContext('2d').drawImage(img, 0, 0);
    canvas.toBlob(async (pngBlob) => {
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': pngBlob })
      ]);
    }, 'image/png');
  } catch (e) {
    alert('复制失败：' + e.message);
  }
}

function getSelectedMarkdown() {
  const selection = window.getSelection();
  if (!selection.rangeCount) return '';
  const container = document.createElement('div');
  for (let i = 0; i < selection.rangeCount; i++) {
    container.appendChild(selection.getRangeAt(i).cloneContents());
  }
  const tempDiv = document.createElement('div');
  tempDiv.appendChild(container);
  let md = '';
  tempDiv.querySelectorAll('*').forEach((el) => {
    const tag = el.tagName.toLowerCase();
    if (tag === 'strong' || tag === 'b') md += `**${el.textContent}**`;
    else if (tag === 'em' || tag === 'i') md += `*${el.textContent}*`;
    else if (tag === 'code') md += `\`${el.textContent}\``;
    else md += el.textContent;
  });
  return md || tempDiv.textContent;
}

async function copyAsMarkdown() {
  ctxMenu.show = false;
  const md = getSelectedMarkdown();
  await navigator.clipboard.writeText(md);
}

async function copyAsPlainText() {
  ctxMenu.show = false;
  await navigator.clipboard.writeText(ctxMenu.text);
}

function onNotesAskImage(dataUrl) {
  emit('askImage', dataUrl);
}

function onNotesAskText(text) {
  emit('askText', text);
}
</script>

<style scoped>
.viewer { display: flex; flex-direction: column; overflow: hidden; flex: 1; min-width: 200px; }
.viewer-head {
  display: flex; align-items: center; gap: 16px;
  padding: 14px 24px; border-bottom: 1px solid var(--border); background: var(--panel); flex-shrink: 0;
}
.viewer-title { font-size: 16px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1; }
.view-tabs { display: flex; gap: 4px; background: #eef0f2; padding: 3px; border-radius: 8px; }
.tab { border: none; background: transparent; padding: 6px 16px; border-radius: 6px; cursor: pointer; font-size: 13px; color: var(--muted); }
.tab.active { background: #fff; color: var(--text); box-shadow: var(--shadow); }
.tab-badge { color: var(--orange); font-size: 10px; margin-left: 3px; animation: blink .8s step-end infinite; }
@keyframes blink { 50% { opacity: 0; } }
.status-bar {
  display: flex; align-items: center; gap: 14px;
  padding: 10px 24px; background: #fffbe6; border-bottom: 1px solid #ffe8b3; font-size: 13px; flex-shrink: 0;
}
.status-bar.failed { background: #fce8e8; border-color: #f5c2c2; color: var(--red); }
.progress { flex: 1; height: 6px; background: #eceef0; border-radius: 3px; overflow: hidden; }
.progress-fill { height: 100%; background: var(--primary); transition: width .3s; }
.viewer-body { flex: 1; overflow: hidden; position: relative; display: flex; }
.outline-panel {
  width: 240px; flex-shrink: 0;
  background: var(--panel); border-right: 1px solid var(--border);
  display: flex; flex-direction: column;
}
.outline-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 16px; border-bottom: 1px solid var(--border);
  font-size: 13px; font-weight: 600;
}
.outline-toggle {
  border: none; background: transparent; cursor: pointer;
  padding: 2px 6px; border-radius: 4px; font-size: 16px;
}
.outline-toggle:hover { background: #eef0f2; }
.outline-nav { flex: 1; overflow-y: auto; padding: 8px 0; }
.outline-item {
  display: block; padding: 6px 16px; font-size: 13px;
  cursor: pointer; color: var(--text); text-decoration: none;
  transition: background .15s;
}
.outline-item:hover { background: #f0f1f3; }
.outline-item.level-1 { font-weight: 600; }
.outline-item.level-2 { padding-left: 28px; }
.outline-item.level-3 { padding-left: 40px; font-size: 12px; }
.outline-item.level-4 { padding-left: 52px; font-size: 12px; }
.outline-item.level-5 { padding-left: 64px; font-size: 11px; }
.outline-item.level-6 { padding-left: 76px; font-size: 11px; }
.outline-show-btn {
  position: absolute; top: 12px; left: 12px; z-index: 10;
  padding: 6px 12px; border-radius: 6px;
  background: var(--panel); border: 1px solid var(--border);
  cursor: pointer; font-size: 13px; box-shadow: var(--shadow);
}
.outline-show-btn:hover { background: #f0f1f3; }
.md-view { height: 100%; overflow-y: auto; padding: 32px 48px; background: #fff; line-height: 1.7; flex: 1; }
.md-view .placeholder { color: var(--muted); text-align: center; margin-top: 80px; }
.md-view .placeholder.error { color: var(--red); }
.md-view :deep(img) { cursor: pointer; transition: opacity .2s; }
.md-view :deep(img:hover) { opacity: 0.85; }
.pdf-wrap { height: 100%; flex: 1; }
.pdf-wrap iframe { width: 100%; height: 100%; border: none; }
.img-ctx-menu {
  position: fixed; z-index: 500;
  background: var(--panel); border: 1px solid var(--border); border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0,0,0,.12); overflow: hidden;
}
.img-ctx-menu button {
  display: block; width: 100%; padding: 10px 16px; border: none; background: transparent;
  text-align: left; cursor: pointer; font-size: 14px; color: var(--text);
}
.img-ctx-menu button:hover { background: #f0f1f3; }
.ctx-backdrop { position: fixed; inset: 0; z-index: 499; }
.preview-modal {
  position: fixed; inset: 0; z-index: 600;
  background: rgba(0, 0, 0, 0.9);
  display: flex; align-items: center; justify-content: center;
  cursor: zoom-out;
}
.preview-modal img {
  max-width: 90vw; max-height: 90vh;
  object-fit: contain;
  cursor: default;
}
.copy-btn {
  position: absolute; top: 20px; right: 20px;
  padding: 10px 16px; border-radius: 8px;
  background: var(--panel); border: 1px solid var(--border);
  cursor: pointer; font-size: 14px; box-shadow: var(--shadow);
  transition: background .2s;
}
.copy-btn:hover { background: #f0f1f3; }
.md-view :deep(.translation-block) {
  margin: 12px 0; padding: 12px 16px;
  background: #f0f7ff; border-left: 3px solid var(--primary); border-radius: 0 8px 8px 0;
}
.md-view :deep(.translation-header) {
  display: flex; align-items: center; gap: 8px; margin-bottom: 8px;
}
.md-view :deep(.translation-label) { font-size: 12px; color: var(--primary); font-weight: 600; }
.md-view :deep(.translation-copy),
.md-view :deep(.translation-remove) {
  border: none; background: transparent; cursor: pointer; font-size: 14px;
  padding: 2px 6px; border-radius: 4px; color: var(--muted); transition: .15s;
}
.md-view :deep(.translation-copy) { margin-left: auto; }
.md-view :deep(.translation-copy:hover) { background: rgba(0,0,0,.06); }
.md-view :deep(.translation-remove:hover) { background: rgba(0,0,0,.06); color: var(--red); }
.md-view :deep(.translation-body) { font-size: 14px; line-height: 1.7; color: var(--text); }
.md-view :deep(.translation-body p) { margin: .3em 0; }
.md-view :deep(.cursor) { animation: blink .7s step-end infinite; }
</style>
