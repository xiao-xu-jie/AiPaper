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
      <article v-show="view === 'md'" ref="mdBox" class="md-view markdown-body" @contextmenu="onContextMenu" @mouseover="onHover" @mouseout="clearHover">
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
      <button v-if="ctxMenu.text" @click="translateSelection">🌐 {{ ctxMenu.hasSelection ? '翻译选中内容' : '翻译此段落' }}</button>
      <template v-if="ctxMenu.hasSelection">
        <div class="ctx-divider"></div>
        <div class="ctx-submenu">
          <span class="ctx-submenu-label">🖍 高亮</span>
          <div class="color-picker">
            <button v-for="c in highlightColors" :key="c.id" class="color-dot" :style="{ background: c.bg }" :title="c.name" @click="highlightSelection(c.id)" />
          </div>
        </div>
        <button @click="addAnnotation">📝 添加注解</button>
      </template>
    </div>
    <div v-if="ctxMenu.show" class="ctx-backdrop" @click="ctxMenu.show = false" @contextmenu.prevent="ctxMenu.show = false" />

    <!-- 图片预览模态框 -->
    <div v-if="preview.show" class="preview-modal" @click="preview.show = false">
      <img :src="preview.src" alt="预览" @click.stop />
      <button class="copy-btn" @click.stop="copyImage">📋 复制图片</button>
    </div>

    <!-- 注解编辑弹窗 -->
    <div v-if="noteEditor.show" class="note-editor-overlay" @click="noteEditor.show = false">
      <div class="note-editor-modal" @click.stop>
        <div class="note-editor-header">
          <span>📝 添加注解</span>
          <button class="close-btn" @click="noteEditor.show = false">✕</button>
        </div>
        <div class="note-editor-anchor">{{ noteEditor.anchorText }}</div>
        <textarea ref="noteEditorArea" v-model="noteEditor.text" rows="5" placeholder="写下你的注解或笔记..." @keydown.ctrl.enter="confirmAnnotation" />
        <div class="note-editor-footer">
          <label class="color-select-label">颜色：
            <select v-model="noteEditor.color">
              <option v-for="c in highlightColors" :key="c.id" :value="c.id">{{ c.name }}</option>
            </select>
          </label>
          <button class="btn primary small" @click="confirmAnnotation">确认</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, computed, reactive, onMounted, nextTick } from 'vue';
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
const ctxMenu = reactive({ show: false, x: 0, y: 0, src: '', text: '', hasSelection: false });
const preview = reactive({ show: false, src: '' });
const showOutline = ref(true);
const outline = ref([]);
const translations = ref([]);
const annotations = ref([]);

const highlightColors = [
  { id: 'yellow', name: '黄色', bg: '#fff3b0', mark: '#ffd54f' },
  { id: 'green', name: '绿色', bg: '#c8f7c5', mark: '#a5d6a7' },
  { id: 'blue', name: '蓝色', bg: '#bbdefb', mark: '#90caf9' },
  { id: 'pink', name: '粉色', bg: '#f8bbd0', mark: '#f48fb1' },
  { id: 'orange', name: '橙色', bg: '#ffe0b2', mark: '#ffcc80' },
];

const noteEditor = reactive({ show: false, anchorText: '', text: '', color: 'yellow', id: null });
const noteEditorArea = ref(null);

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
    annotations.value = await store.loadAnnotations(id).catch(() => []);
    restoreAnnotations();
  }
  if (pdfFrame.value) {
    const url = await store.getPdfUrl(id).catch(() => null);
    pdfFrame.value.src = url || 'about:blank';
  }
});

function onHover(e) {
  const block = findHoverBlock(e.target);
  if (block) block.classList.add('hover-block');
}

function clearHover(e) {
  const block = findHoverBlock(e.target);
  if (block) block.classList.remove('hover-block');
}

function onImageClick(e) {
  if (e.target.tagName === 'IMG') {
    preview.src = e.target.src;
    preview.show = true;
  }
}

// 找到鼠标所在的最接近 mdBox 直接子元素的段落块
function findHoverBlock(target) {
  if (!mdBox.value || !target || target === mdBox.value) return null;
  let el = target;
  while (el && el.parentElement !== mdBox.value) {
    el = el.parentElement;
    if (!el) return null;
  }
  const tag = el?.tagName;
  if (!tag) return null;
  const blockTags = ['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'TD', 'TH', 'BLOCKQUOTE', 'PRE', 'DD', 'DT'];
  return blockTags.includes(tag) ? el : null;
}

function onContextMenu(e) {
  const isImg = e.target.tagName === 'IMG';
  const selectedText = window.getSelection()?.toString().trim() || '';
  const hoverBlock = findHoverBlock(e.target);
  if (!isImg && !selectedText && !hoverBlock) return;
  e.preventDefault();
  ctxMenu.src = isImg ? e.target.src : '';
  ctxMenu.text = selectedText || (hoverBlock ? hoverBlock.textContent.trim() : '');
  ctxMenu.hasSelection = !!selectedText;
  ctxMenu.x = e.clientX;
  ctxMenu.y = e.clientY;
  ctxMenu.show = true;
}

function askAboutText() {
  ctxMenu.show = false;
  emit('askText', ctxMenu.text);
}

// ---------- 翻译 ----------
// 按段落块匹配 textContent,兼容段落内有 mark/高亮等子标签的情况
function findAnchorElement(selectedText) {
  if (!mdBox.value) return null;
  const blockTags = ['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'TD', 'TH', 'BLOCKQUOTE', 'PRE', 'DD', 'DT'];
  for (const child of mdBox.value.children) {
    if (blockTags.includes(child.tagName) && child.textContent.includes(selectedText)) {
      return child;
    }
  }
  // 兜底:文本节点级匹配(选中文字在单个文本节点内时)
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

// ---------- 高亮 ----------
function getColorMark(colorId) {
  return highlightColors.find((c) => c.id === colorId)?.mark || '#ffd54f';
}

function highlightSelection(colorId) {
  ctxMenu.show = false;
  const selectedText = ctxMenu.text;
  if (!selectedText) return;
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return;
  const range = sel.getRangeAt(0);
  const id = 'hl_' + Date.now().toString(36);
  const mark = document.createElement('mark');
  mark.className = 'user-highlight';
  mark.dataset.id = id;
  mark.dataset.color = colorId;
  mark.style.background = getColorMark(colorId);
  mark.title = '点击删除高亮';
  try {
    range.surroundContents(mark);
    const ann = { id, type: 'highlight', anchorText: selectedText, color: colorId, createdAt: Date.now() };
    annotations.value.push(ann);
    store.saveAnnotations(papers.currentId, annotations.value).catch(() => {});
    mark.addEventListener('click', (e) => { e.stopPropagation(); removeHighlight(id); });
  } catch { /* 跨节点选择 surroundContents 可能失败,忽略 */ }
}

function removeHighlight(id) {
  const mark = mdBox.value?.querySelector(`mark.user-highlight[data-id="${id}"]`);
  if (mark) {
    const parent = mark.parentNode;
    while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
    parent.removeChild(mark);
    parent.normalize();
  }
  annotations.value = annotations.value.filter((a) => a.id !== id);
  store.saveAnnotations(papers.currentId, annotations.value).catch(() => {});
}

function restoreHighlights() {
  if (!mdBox.value) return;
  annotations.value.filter((a) => a.type === 'highlight').forEach((ann) => {
    const walker = document.createTreeWalker(mdBox.value, NodeFilter.SHOW_TEXT, null);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const idx = node.textContent.indexOf(ann.anchorText);
      if (idx >= 0) {
        const range = document.createRange();
        range.setStart(node, idx);
        range.setEnd(node, idx + ann.anchorText.length);
        const mark = document.createElement('mark');
        mark.className = 'user-highlight';
        mark.dataset.id = ann.id;
        mark.dataset.color = ann.color;
        mark.style.background = getColorMark(ann.color);
        mark.title = '点击删除高亮';
        try {
          range.surroundContents(mark);
          mark.addEventListener('click', (e) => { e.stopPropagation(); removeHighlight(ann.id); });
        } catch { /* 跨节点失败忽略 */ }
        break;
      }
    }
  });
}

// ---------- 注解 ----------
function addAnnotation() {
  ctxMenu.show = false;
  noteEditor.anchorText = ctxMenu.text;
  noteEditor.text = '';
  noteEditor.color = 'yellow';
  noteEditor.id = null;
  noteEditor.show = true;
  nextTick(() => noteEditorArea.value?.focus());
}

function editAnnotation(id) {
  const ann = annotations.value.find((a) => a.id === id);
  if (!ann) return;
  noteEditor.anchorText = ann.anchorText;
  noteEditor.text = ann.note;
  noteEditor.color = ann.color;
  noteEditor.id = id;
  noteEditor.show = true;
  nextTick(() => noteEditorArea.value?.focus());
}

function confirmAnnotation() {
  if (!noteEditor.text.trim()) {
    noteEditor.show = false;
    return;
  }
  if (noteEditor.id) {
    const ann = annotations.value.find((a) => a.id === noteEditor.id);
    if (ann) {
      ann.note = noteEditor.text.trim();
      ann.color = noteEditor.color;
      const block = mdBox.value?.querySelector(`.annotation-block[data-id="${noteEditor.id}"]`);
      if (block) {
        block.dataset.color = noteEditor.color;
        block.style.borderLeftColor = getColorMark(noteEditor.color);
        block.querySelector('.annotation-body').textContent = ann.note;
      }
      const mark = mdBox.value?.querySelector(`mark.annotated-text[data-id="${noteEditor.id}"]`);
      if (mark) {
        mark.style.background = getColorMark(noteEditor.color);
        mark.style.borderBottomColor = getColorMark(noteEditor.color);
      }
    }
  } else {
    const id = 'note_' + Date.now().toString(36);
    const ann = { id, type: 'note', anchorText: noteEditor.anchorText, note: noteEditor.text.trim(), color: noteEditor.color, createdAt: Date.now() };
    annotations.value.push(ann);
    markAnnotatedText(ann);
    insertAnnotationBlock(ann);
  }
  store.saveAnnotations(papers.currentId, annotations.value).catch(() => {});
  noteEditor.show = false;
}

// 用 mark 标记被注解的原文,与注解块用 data-id 关联
function markAnnotatedText(ann) {
  if (!mdBox.value) return;
  const walker = document.createTreeWalker(mdBox.value, NodeFilter.SHOW_TEXT, null);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    const idx = node.textContent.indexOf(ann.anchorText);
    if (idx >= 0) {
      const range = document.createRange();
      range.setStart(node, idx);
      range.setEnd(node, idx + ann.anchorText.length);
      const mark = document.createElement('mark');
      mark.className = 'annotated-text';
      mark.dataset.id = ann.id;
      mark.dataset.color = ann.color;
      const color = getColorMark(ann.color);
      mark.style.background = color + '60';
      mark.style.borderBottom = `2px dashed ${color}`;
      mark.title = '此段有注解，点击查看';
      try {
        range.surroundContents(mark);
        mark.addEventListener('click', (e) => {
          e.stopPropagation();
          const block = mdBox.value?.querySelector(`.annotation-block[data-id="${ann.id}"]`);
          if (block) {
            block.scrollIntoView({ behavior: 'smooth', block: 'center' });
            block.classList.add('annotation-flash');
            setTimeout(() => block.classList.remove('annotation-flash'), 1500);
          }
        });
      } catch { /* 跨节点失败忽略 */ }
      break;
    }
  }
}

function createAnnotationBlock(ann) {
  const block = document.createElement('div');
  block.className = 'annotation-block';
  block.dataset.id = ann.id;
  block.dataset.color = ann.color;
  block.style.borderLeftColor = getColorMark(ann.color);
  block.title = '点击定位到原文';
  block.innerHTML = `
    <div class="annotation-header">
      <span class="annotation-label">📝 注解</span>
      <button class="annotation-edit" title="编辑">✎</button>
      <button class="annotation-remove" title="删除">✕</button>
    </div>
    <div class="annotation-body"></div>
  `;
  block.querySelector('.annotation-body').textContent = ann.note;
  block.querySelector('.annotation-edit').addEventListener('click', (e) => { e.stopPropagation(); editAnnotation(ann.id); });
  block.querySelector('.annotation-remove').addEventListener('click', (e) => { e.stopPropagation(); removeAnnotation(ann.id); });
  block.addEventListener('click', () => {
    const mark = mdBox.value?.querySelector(`mark.annotated-text[data-id="${ann.id}"]`);
    if (mark) {
      mark.scrollIntoView({ behavior: 'smooth', block: 'center' });
      mark.classList.add('annotation-flash');
      setTimeout(() => mark.classList.remove('annotation-flash'), 1500);
    }
  });
  return block;
}

function insertAnnotationBlock(ann) {
  const anchor = findAnchorElement(ann.anchorText);
  const block = createAnnotationBlock(ann);
  if (anchor && anchor.parentElement) {
    anchor.insertAdjacentElement('afterend', block);
  } else if (mdBox.value) {
    mdBox.value.appendChild(block);
  }
}

function removeAnnotation(id) {
  annotations.value = annotations.value.filter((a) => a.id !== id);
  store.saveAnnotations(papers.currentId, annotations.value).catch(() => {});
  const block = mdBox.value?.querySelector(`.annotation-block[data-id="${id}"]`);
  if (block) block.remove();
  const mark = mdBox.value?.querySelector(`mark.annotated-text[data-id="${id}"]`);
  if (mark) {
    const parent = mark.parentNode;
    while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
    parent.removeChild(mark);
    parent.normalize();
  }
}

function restoreAnnotations() {
  if (!mdBox.value) return;
  restoreHighlights();
  annotations.value.filter((a) => a.type === 'note').forEach((ann) => {
    markAnnotatedText(ann);
    insertAnnotationBlock(ann);
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
.md-view :deep(.hover-block) {
  background: #f0f4f8;
  border-radius: 4px;
  box-shadow: 0 0 0 2px #e0e7ff;
  cursor: context-menu;
}
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

.md-view :deep(mark.user-highlight) {
  border-radius: 3px; padding: 1px 2px; cursor: pointer;
  transition: opacity .15s;
}
.md-view :deep(mark.user-highlight:hover) { opacity: 0.7; }

.md-view :deep(mark.annotated-text) {
  border-radius: 3px; padding: 1px 2px; cursor: pointer;
  transition: background .15s;
}
.md-view :deep(mark.annotated-text:hover) { background: rgba(255, 213, 79, 0.4) !important; }

.md-view :deep(.annotation-block) {
  margin: 10px 0; padding: 10px 14px;
  background: #fffde7; border-left: 3px solid #ffd54f; border-radius: 0 8px 8px 0;
  transition: box-shadow .3s;
}
.md-view :deep(.annotation-block.annotation-flash) {
  box-shadow: 0 0 0 3px #ffd54f;
}
.md-view :deep(mark.annotated-text.annotation-flash) {
  box-shadow: 0 0 0 3px #ffd54f;
  border-radius: 3px;
}
.md-view :deep(.annotation-header) {
  display: flex; align-items: center; gap: 8px; margin-bottom: 6px;
}
.md-view :deep(.annotation-label) { font-size: 12px; color: var(--muted); font-weight: 600; }
.md-view :deep(.annotation-edit),
.md-view :deep(.annotation-remove) {
  border: none; background: transparent; cursor: pointer; font-size: 14px;
  padding: 2px 6px; border-radius: 4px; color: var(--muted); transition: .15s;
}
.md-view :deep(.annotation-edit) { margin-left: auto; }
.md-view :deep(.annotation-edit:hover) { background: rgba(0,0,0,.06); }
.md-view :deep(.annotation-remove:hover) { background: rgba(0,0,0,.06); color: var(--red); }
.md-view :deep(.annotation-body) { font-size: 14px; line-height: 1.6; color: var(--text); white-space: pre-wrap; }

.ctx-divider { height: 1px; background: var(--border); margin: 4px 0; }
.ctx-submenu { padding: 6px 16px; }
.ctx-submenu-label { font-size: 12px; color: var(--muted); display: block; margin-bottom: 6px; }
.color-picker { display: flex; gap: 8px; }
.color-dot {
  width: 20px; height: 20px; border-radius: 50%; border: 2px solid #fff;
  cursor: pointer; transition: transform .15s; box-shadow: 0 0 0 1px var(--border);
}
.color-dot:hover { transform: scale(1.2); }

.note-editor-overlay {
  position: fixed; inset: 0; z-index: 1000;
  background: rgba(0,0,0,.5);
  display: flex; align-items: center; justify-content: center; padding: 20px;
}
.note-editor-modal {
  background: #fff; border-radius: 12px; box-shadow: 0 8px 32px rgba(0,0,0,.2);
  max-width: 500px; width: 100%; padding: 20px 24px;
}
.note-editor-header {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 12px; font-size: 16px; font-weight: 600;
}
.note-editor-header .close-btn {
  border: none; background: transparent; font-size: 20px; cursor: pointer;
  padding: 2px 8px; border-radius: 6px;
}
.note-editor-header .close-btn:hover { background: #f0f1f3; }
.note-editor-anchor {
  font-size: 13px; color: var(--muted); background: #f8f9fa;
  padding: 8px 12px; border-radius: 6px; margin-bottom: 12px;
  max-height: 80px; overflow-y: auto; line-height: 1.5;
}
.note-editor-modal textarea {
  width: 100%; resize: vertical; padding: 10px 12px;
  border: 1px solid var(--border); border-radius: 8px;
  font-size: 14px; font-family: inherit; line-height: 1.6; outline: none;
}
.note-editor-modal textarea:focus { border-color: var(--primary); }
.note-editor-footer {
  display: flex; align-items: center; gap: 12px; margin-top: 12px;
}
.color-select-label { font-size: 13px; color: var(--muted); flex: 1; }
.color-select-label select {
  padding: 4px 8px; border: 1px solid var(--border); border-radius: 5px; font-size: 13px;
}
</style>
