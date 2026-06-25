<template>
  <div class="notes-wrap">
    <div class="notes-toolbar">
      <select
        v-model="activeNoteId"
        class="note-select"
        :disabled="generating"
        @change="selectActiveNote"
      >
        <option v-if="!noteDocs.length" value="">尚无笔记</option>
        <option v-for="note in noteDocs" :key="note.id" :value="note.id">
          {{ noteTitle(note) }}
        </option>
      </select>
      <button class="btn small" :disabled="generating || !papers.currentId" @click="createNoteFromTemplate()">新建笔记</button>
      <button
        class="btn small danger-lite"
        :disabled="generating || !activeNoteId"
        @click="deleteCurrentNote"
      >删除</button>
      <span class="notes-status">{{ statusText }}</span>
      <select
        v-model="cfg.activeNoteTemplateId"
        class="template-select"
        :disabled="generating"
        @change="onTemplateChange"
      >
        <option v-for="template in cfg.noteTemplates" :key="template.id" :value="template.id">
          {{ template.name }}
        </option>
      </select>
      <button class="btn small" :disabled="generating || !papers.currentId" @click="applyCurrentTemplate">套用模板</button>
      <ModelSwitcher />
      <button class="btn small" :disabled="generating" @click="generate">
        {{ generating ? '生成中...' : '✨ AI 生成笔记' }}
      </button>
      <button v-if="generating" class="btn small danger-lite" @click="cancelGenerate">停止生成</button>
      <button class="btn small" :class="{ active: mode === 'edit' }" @click="mode = 'edit'">编辑</button>
      <button class="btn small" :class="{ active: mode === 'preview' }" @click="mode = 'preview'">预览</button>
      <button class="btn small" @click="save">保存</button>
    </div>

    <div class="notes-body">
      <aside v-if="mode === 'preview' && showOutline && !generating && outline.length" class="outline-panel">
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
      <button v-if="mode === 'preview' && !showOutline && !generating && outline.length" class="outline-show-btn" @click="showOutline = true">☰ 目录</button>

      <div v-if="generating" class="notes-generating">
        <div ref="streamEl" class="gen-bubble markdown-body" @contextmenu="onContextMenu" @click="onImageClick" />
      </div>

      <textarea
        v-if="!generating && mode === 'edit'"
        v-model="noteText"
        class="notes-editor"
        placeholder="尚无笔记，点击「AI 生成笔记」自动生成，或直接在此编辑..."
      />
      <article
        v-show="!generating && mode === 'preview'"
        ref="previewEl"
        class="notes-preview markdown-body"
        @contextmenu="onContextMenu"
        @click="onImageClick"
      />
    </div>

    <!-- 右键菜单 -->
    <Teleport to="body">
      <div v-if="ctxMenu.show" class="img-ctx-menu" :style="{ left: ctxMenu.x + 'px', top: ctxMenu.y + 'px' }" @click.stop>
        <button v-if="ctxMenu.src" @click="copyImageFromMenu">📋 复制图片</button>
        <button v-if="ctxMenu.src" @click="askAboutImage">💬 向 AI 提问此图</button>
        <button v-if="ctxMenu.text" @click="copyAsMarkdown">📋 复制为 Markdown</button>
        <button v-if="ctxMenu.text" @click="copyAsPlainText">📋 复制为纯文本</button>
        <button v-if="ctxMenu.text" @click="askAboutText">💬 向 AI 提问选中内容</button>
      </div>
      <div v-if="ctxMenu.show" class="ctx-backdrop" @click="ctxMenu.show = false" @contextmenu.prevent="ctxMenu.show = false" />

      <!-- 图片预览 -->
      <div v-if="preview.show" class="preview-modal" @click="preview.show = false">
        <img :src="preview.src" alt="预览" @click.stop />
        <button class="copy-btn" @click.stop="copyImage">📋 复制图片</button>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, watch, computed, nextTick, reactive, inject, onUnmounted } from 'vue';
import { usePapersStore } from '../stores/papers.js';
import { useConfigStore } from '../stores/config.js';
import { cleanupMarkdownRender, parseMarkdown, renderMarkdown } from '../lib/render.js';
import * as store from '../lib/store.js';
import * as agent from '../lib/agent.js';
import ModelSwitcher from './ModelSwitcher.vue';

const papers = usePapersStore();
const cfg = useConfigStore();
const emit = defineEmits(['askImage', 'askText']);
const toast = inject('toast');

const noteText = ref('');
const noteDocs = ref([]);
const activeNoteId = ref('');
const mode = ref('edit');
const statusText = ref('');
const previewEl = ref(null);
const streamEl = ref(null);
const ctxMenu = reactive({ show: false, x: 0, y: 0, src: '', text: '' });
const preview = reactive({ show: false, src: '' });
const showOutline = ref(true);
const outline = ref([]);
let noteAbortController = null;

// 生成状态按论文隔离，支持多篇论文同时后台生成。
const currentNoteTask = computed(() => papers.currentId ? papers.noteTask(papers.currentId) : null);
const generating = computed(() => Boolean(currentNoteTask.value?.generating));
const streamText = computed(() => currentNoteTask.value?.stream || '');
const currentTemplate = computed(() => cfg.currentNoteTemplate);
const currentNoteDoc = computed(() => noteDocs.value.find((note) => note.id === activeNoteId.value) || null);

function noteTitle(note) {
  if (!note) return '阅读笔记';
  const suffix = note.templateName ? ` · ${note.templateName}` : '';
  return `${note.title || '阅读笔记'}${suffix}`;
}

function extractOutline() {
  if (!previewEl.value) return [];
  const headings = previewEl.value.querySelectorAll('h1, h2, h3, h4, h5, h6');
  return [...headings].map((el, idx) => {
    const id = `note-heading-${idx}`;
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

async function refreshNoteDocs(preferredId = '') {
  if (!papers.currentId) {
    noteDocs.value = [];
    activeNoteId.value = '';
    return;
  }
  const result = await store.listNoteDocs(papers.currentId).catch(() => ({ activeId: '', notes: [] }));
  noteDocs.value = result.notes || [];
  const preferredExists = preferredId && noteDocs.value.some((note) => note.id === preferredId);
  activeNoteId.value = preferredExists ? preferredId : (result.activeId || noteDocs.value[0]?.id || '');
}

async function loadActiveNoteText() {
  if (!papers.currentId || !activeNoteId.value) {
    noteText.value = '';
    mode.value = 'edit';
    statusText.value = papers.currentId ? '当前论文还没有笔记' : '';
    return;
  }
  const loadForPaper = papers.currentId;
  const loadForNote = activeNoteId.value;
  const saved = await store.loadNoteDoc(loadForPaper, loadForNote).catch(() => null);
  if (papers.currentId !== loadForPaper || activeNoteId.value !== loadForNote) return;
  noteText.value = saved || '';
  mode.value = saved ? 'preview' : 'edit';
  statusText.value = saved ? `已加载：${noteTitle(currentNoteDoc.value)}` : '新笔记，可直接编辑或生成';
}

// 切换论文时加载对应笔记列表（后台生成不受影响）
watch(() => papers.currentId, async (id) => {
  noteText.value = '';
  noteDocs.value = [];
  activeNoteId.value = '';
  statusText.value = '';
  if (!id) return;
  // 若正在为当前论文生成，显示进行中状态即可
  const task = papers.noteTask(id);
  await refreshNoteDocs(task?.noteId || '');
  if (task?.generating) {
    statusText.value = task.templateName ? `正在按「${task.templateName}」生成...` : '正在生成...';
    mode.value = 'preview';
    await nextTick();
    scheduleStreamRender(task.stream || '', id);
    return;
  }
  if (task?.error) statusText.value = `生成失败：${task.error}`;
  await loadActiveNoteText();
}, { immediate: true });

// 流式生成中：只有当前论文就是生成目标时才更新 DOM
const imgCache = new Map(); // rel path → object URL，避免重复请求导致图片闪烁
let streamRenderTimer = null;
let streamRenderSeq = 0;

function clearStreamRenderTimer() {
  if (streamRenderTimer) {
    clearTimeout(streamRenderTimer);
    streamRenderTimer = null;
  }
}

function clearStreamImageCache() {
  for (const url of imgCache.values()) {
    try { URL.revokeObjectURL(url); } catch { /* noop */ }
  }
  imgCache.clear();
}

function scheduleStreamRender(text, paperId = papers.currentId) {
  clearStreamRenderTimer();
  const seq = ++streamRenderSeq;
  const length = String(text || '').length;
  const delay = length > 120000 ? 360 : length > 50000 ? 180 : 80;
  streamRenderTimer = setTimeout(() => {
    renderStreamMarkdown(text, seq, paperId);
  }, delay);
}

async function renderStreamMarkdown(text, seq, paperId) {
  if (seq !== streamRenderSeq) return;
  if (!streamEl.value || papers.currentId !== paperId || !papers.isNoteGenerating(paperId)) return;
  streamEl.value.innerHTML = parseMarkdown(text) + '<span class="cursor">▌</span>';
  // 用缓存替换已知图片，未缓存的异步获取后存入缓存
  const imgs = streamEl.value.querySelectorAll('img');
  await Promise.all([...imgs].map(async (img) => {
    const src = img.getAttribute('src') || '';
    if (/^(https?:|data:|blob:)/i.test(src)) return;
    const rel = src.replace(/^\.?\//, '');
    if (!imgCache.has(rel)) {
      const { getAssetUrl } = await import('../lib/store.js');
      const url = await getAssetUrl(paperId, rel);
      if (url) imgCache.set(rel, url);
    }
    if (seq !== streamRenderSeq || papers.currentId !== paperId) return;
    if (imgCache.has(rel)) img.src = imgCache.get(rel);
    img.loading = 'lazy';
  }));
}

watch(streamText, (text) => {
  if (generating.value) scheduleStreamRender(text, papers.currentId);
});

watch(() => papers.currentId, () => {
  clearStreamRenderTimer();
  clearStreamImageCache();
}, { flush: 'sync' });

onUnmounted(() => {
  clearStreamRenderTimer();
  clearStreamImageCache();
  cleanupMarkdownRender(previewEl.value);
});

function cancelGenerate() {
  noteAbortController?.abort();
}

function formatTemplateDate() {
  const date = new Date();
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function renderNoteTemplate(templateText, paper = papers.currentPaper) {
  const metadata = paper?.metadata || {};
  const authors = Array.isArray(metadata.authors) ? metadata.authors.join('、') : (metadata.authors || '');
  const values = {
    title: paper?.title || metadata.title || paper?.remark || paper?.fileName || '论文',
    fileName: paper?.fileName || '',
    date: formatTemplateDate(),
    authors,
    year: metadata.year || '',
    venue: metadata.venue || '',
    tags: paper?.tags?.length ? paper.tags.join('、') : '无',
  };
  return String(templateText || '').replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key) => (
    Object.prototype.hasOwnProperty.call(values, key) ? values[key] : match
  ));
}

function onTemplateChange() {
  cfg.selectNoteTemplate(cfg.activeNoteTemplateId);
  cfg.save();
}

async function selectActiveNote() {
  if (!papers.currentId) return;
  await store.setActiveNoteDoc(papers.currentId, activeNoteId.value).catch(() => {});
  await loadActiveNoteText();
}

function noteMetaFromTemplate(template = currentTemplate.value) {
  return {
    title: template?.name || '阅读笔记',
    templateId: template?.id || '',
    templateName: template?.name || '',
  };
}

async function createNoteFromTemplate(options = {}) {
  if (!papers.currentId) return null;
  const template = currentTemplate.value;
  const initialText = options.empty ? '' : renderNoteTemplate(template?.content);
  const doc = await store.createNoteDoc(papers.currentId, noteMetaFromTemplate(template), initialText);
  await refreshNoteDocs(doc.id);
  noteText.value = initialText;
  mode.value = 'edit';
  statusText.value = `已新建：${noteTitle(doc)}`;
  return doc;
}

async function deleteCurrentNote() {
  if (!papers.currentId || !activeNoteId.value) return;
  const title = noteTitle(currentNoteDoc.value);
  if (!window.confirm(`确认删除「${title}」？此操作不可恢复。`)) return;
  await store.deleteNoteDoc(papers.currentId, activeNoteId.value);
  await refreshNoteDocs();
  await loadActiveNoteText();
  statusText.value = '笔记已删除';
}

async function applyCurrentTemplate() {
  if (!papers.currentId) return;
  if (!activeNoteId.value) {
    await createNoteFromTemplate();
    return;
  }
  if (noteText.value.trim() && !window.confirm('当前笔记已有内容，套用模板会覆盖编辑区内容，是否继续？')) return;
  noteText.value = renderNoteTemplate(currentTemplate.value?.content);
  mode.value = 'edit';
  statusText.value = `已套用模板：${currentTemplate.value?.name || '自定义模板'}，可继续编辑后保存`;
}

// 预览时用 renderMarkdown 替换图片路径
watch([mode, noteText], async ([m]) => {
  if (m !== 'preview' || !papers.currentId) return;
  const renderFor = papers.currentId;
  await nextTick();
  if (previewEl.value && papers.currentId === renderFor) {
    await renderMarkdown(previewEl.value, noteText.value, renderFor);
    if (papers.currentId !== renderFor) return;
    outline.value = extractOutline();
  }
});

async function generate() {
  const generatingFor = papers.currentId;
  if (!generatingFor) {
    toast('请先选择一篇已解析完成的论文', 'error');
    return;
  }
  const paperMd = await store.loadMarkdown(generatingFor).catch(() => null);
  if (!paperMd) {
    toast('请先选择一篇已解析完成的论文', 'error');
    return;
  }
  if (!cfg.aiUrl || !cfg.aiModel) {
    toast('请先配置 AI 接口地址和模型', 'error');
    return;
  }

  const selectedTemplate = currentTemplate.value;
  let targetDoc = currentNoteDoc.value;
  if (!targetDoc) {
    targetDoc = await createNoteFromTemplate({ empty: true });
  } else if (
    noteText.value.trim()
    && targetDoc.templateId
    && selectedTemplate?.id
    && targetDoc.templateId !== selectedTemplate.id
  ) {
    targetDoc = await createNoteFromTemplate({ empty: true });
  } else if (noteText.value.trim() && !window.confirm('当前笔记已有内容，重新生成会覆盖当前笔记，是否继续？')) {
    return;
  }
  if (!targetDoc) return;

  const template = renderNoteTemplate(selectedTemplate?.content);
  const templatePrompt = selectedTemplate?.prompt || '请按模板生成结构化阅读笔记。';

  const prompt = `请根据以下论文内容，严格按照给定模板生成一份详细的阅读笔记，使用 Markdown 格式输出，不要有多余解释。

要求：
- 当前模板：${selectedTemplate?.name || '自定义模板'}
- 模板生成要求：${templatePrompt}
- 如果论文内容中包含图片（Markdown 格式如 ![...](images/xxx.png)），请在笔记的相关位置原样嵌入对应图片引用，让笔记更直观。

模板：
${template}

论文内容（Markdown 格式）：
${paperMd}`;

  const targetNoteId = targetDoc.id;
  papers.beginNoteGeneration(generatingFor, {
    noteId: targetNoteId,
    noteTitle: targetDoc.title,
    templateId: selectedTemplate?.id || '',
    templateName: selectedTemplate?.name || '',
  });
  statusText.value = `正在按「${selectedTemplate?.name || '自定义模板'}」生成...`;
  mode.value = 'preview';
  noteAbortController = new AbortController();

  try {
    const result = await agent.chat([], prompt, [], (chunk) => {
      papers.appendNoteStream(generatingFor, chunk);
    }, { signal: noteAbortController.signal });
    const note = typeof result === 'string' ? result : result.content;
    await store.saveNoteDoc(generatingFor, targetNoteId, note, noteMetaFromTemplate(selectedTemplate));
    papers.finishNoteGeneration(generatingFor);
    if (papers.currentId === generatingFor) {
      await refreshNoteDocs(targetNoteId);
      noteText.value = note;
      mode.value = 'preview';
      statusText.value = '生成完成，可继续编辑';
    }
  } catch (e) {
    if (agent.isAbortError(e)) {
      const partial = papers.noteTask(generatingFor)?.stream || '';
      if (partial.trim()) await store.saveNoteDoc(generatingFor, targetNoteId, partial, noteMetaFromTemplate(selectedTemplate));
      papers.finishNoteGeneration(generatingFor);
      if (papers.currentId === generatingFor) {
        await refreshNoteDocs(targetNoteId);
        noteText.value = partial;
        mode.value = partial.trim() ? 'preview' : 'edit';
        statusText.value = partial.trim() ? '已停止，已保留当前内容' : '已停止';
      }
      return;
    }
    papers.failNoteGeneration(generatingFor, e.message);
    if (papers.currentId === generatingFor) {
      statusText.value = '生成失败：' + e.message;
      toast('生成失败：' + e.message, 'error');
    }
  } finally {
    if (noteAbortController?.signal?.aborted || papers.currentId === generatingFor) {
      noteAbortController = null;
    }
  }
}

async function save() {
  if (!papers.currentId) return;
  let noteId = activeNoteId.value;
  const draft = noteText.value;
  if (!noteId) {
    const doc = await createNoteFromTemplate({ empty: true });
    noteId = doc?.id || '';
    noteText.value = draft;
  }
  if (!noteId) return;
  await store.saveNoteDoc(papers.currentId, noteId, draft, currentNoteDoc.value || noteMetaFromTemplate());
  await refreshNoteDocs(noteId);
  statusText.value = '已保存';
}

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
</script>

<style scoped>
.notes-wrap { display: flex; flex-direction: column; height: 100%; overflow: hidden; background: #fff; flex: 1; }
.notes-toolbar {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 20px; border-bottom: 1px solid var(--border); flex-shrink: 0;
}
.notes-status {
  flex: 1;
  min-width: 80px;
  font-size: 12px;
  color: var(--muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.note-select,
.template-select {
  width: 150px;
  max-width: 20vw;
  height: 30px;
  padding: 0 8px;
  border: 1px solid var(--border);
  border-radius: 7px;
  background: #fff;
  color: var(--text);
  font-size: 13px;
}
.note-select {
  width: 190px;
}
.note-select:disabled,
.template-select:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.btn.active { background: var(--primary); color: #fff; border-color: var(--primary); }
.danger-lite { color: var(--red); border-color: #f2c0c0; }
.notes-body { flex: 1; overflow: hidden; position: relative; display: flex; }
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
.notes-editor {
  flex: 1; resize: none; border: none; outline: none;
  padding: 24px 40px; font-family: "SF Mono", Consolas, monospace;
  font-size: 14px; line-height: 1.8; overflow-y: auto;
}
.notes-preview { flex: 1; overflow-y: auto; padding: 24px 40px; line-height: 1.7; }
.notes-preview :deep(img) { cursor: pointer; transition: opacity .2s; }
.notes-preview :deep(img:hover) { opacity: 0.85; }
.notes-generating { flex: 1; overflow-y: auto; padding: 24px 40px; }
.gen-bubble { line-height: 1.7; }
.gen-bubble :deep(img) { cursor: pointer; transition: opacity .2s; }
.gen-bubble :deep(img:hover) { opacity: 0.85; }
.cursor { animation: blink .7s step-end infinite; }
@keyframes blink { 50% { opacity: 0; } }
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
</style>
