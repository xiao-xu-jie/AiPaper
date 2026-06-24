<template>
  <div ref="panelEl" class="chat-shell" :style="{ width: width + 'px' }">
  <div ref="resizerEl" class="resizer" @mousedown="startDrag" />
  <aside class="chat-panel">
    <div class="chat-head">
      <button class="btn small" title="切换会话" @click="chat.openPicker()">☰</button>
      <span v-if="!editingTitle" class="chat-title" @dblclick="startEdit">{{ chat.session?.title }}</span>
      <input v-else ref="titleInput" v-model="titleDraft" class="chat-title-input" @blur="commitEdit" @keydown.enter="commitEdit" />
      <button class="btn small" title="编辑标题" @click="startEdit">✎</button>
      <button class="btn small" title="新建会话" @click="chat.newSession()">＋</button>
      <button class="btn small" title="关闭" @click="$emit('close')">✕</button>
    </div>

    <div ref="msgBox" class="chat-messages" @click="onMsgClick">
      <template v-for="(msg, i) in chat.session?.messages" :key="i">
        <div class="chat-msg" :class="msgRole(msg)">
          <div class="chat-bubble" :class="msgRole(msg)" v-html="renderBubble(msg)" />
          <div v-if="msgRole(msg) === 'assistant'" class="copy-bar">
            <span v-if="msgMetaText(msg)" class="msg-meta">{{ msgMetaText(msg) }}</span>
            <button
              v-if="i === lastAssistantIndex"
              class="copy-btn"
              :disabled="chat.busy"
              @click="regenerateLast"
            >
              {{ msg.meta?.error || msg.meta?.canceled ? '重试' : '重新生成' }}
            </button>
            <button class="copy-btn" @click="copy(msg, 'md')">复制 MD</button>
            <button class="copy-btn" @click="copy(msg, 'text')">复制纯文本</button>
          </div>
        </div>
      </template>
      <div v-if="chat.busy" class="chat-msg assistant">
        <div class="stream-head">
          <span>{{ activeModelLabel }} 正在生成...</span>
        </div>
        <div class="chat-bubble assistant" v-html="streamingHtml" />
      </div>
    </div>

    <div class="chat-input-wrap">
      <div v-if="pendingImages.length" class="chat-img-preview">
        <div v-for="(src, i) in pendingImages" :key="i" class="chat-img-thumb">
          <img :src="src" />
          <button @click="pendingImages.splice(i, 1)">✕</button>
        </div>
      </div>
      <div v-if="selectedRefPapers.length" class="ref-strip">
        <span class="ref-count">引用 {{ selectedRefPapers.length }}/3</span>
        <button v-for="p in selectedRefPapers" :key="p.id" class="ref-chip" :title="paperTitle(p)" @click="toggleRefPaper(p.id)">
          {{ paperTitle(p) }} ×
        </button>
        <button class="ref-clear" @click="selectedRefIds = []">清除</button>
      </div>
      <textarea
        ref="inputEl"
        v-model="inputMsg"
        rows="3"
        placeholder="向 AI 提问（Shift+Enter 换行，Enter 发送）"
        @keydown.enter.exact.prevent="send"
        @paste="onPaste"
      />
      <div class="chat-input-bar">
        <button
          class="ref-tool-btn"
          type="button"
          :class="{ active: selectedRefPapers.length }"
          :title="selectedRefPapers.length ? `已引用 ${selectedRefPapers.length} 篇论文` : '选择引用论文'"
          @click="showRefPicker = true"
        >
          <span class="ref-tool-icon">↗</span>
          <span>引用</span>
          <span v-if="selectedRefPapers.length" class="ref-tool-count">{{ selectedRefPapers.length }}</span>
        </button>
        <ModelSwitcher />
        <button v-if="chat.busy" class="btn stop-btn" @click="chat.cancelCurrent()">停止</button>
        <button v-else class="btn primary" @click="send">发送</button>
      </div>
    </div>
  </aside>
  </div>

  <Teleport to="body">
    <div v-if="previewSrc" class="img-preview-overlay" @click="previewSrc = null">
      <img :src="previewSrc" @click.stop />
    </div>
  </Teleport>

  <Teleport to="body">
    <div v-if="showRefPicker" class="ref-picker-backdrop" @click="showRefPicker = false">
      <div class="ref-picker" @click.stop>
        <div class="ref-picker-head">
          <span>选择引用论文</span>
          <button class="close-btn" @click="showRefPicker = false">×</button>
        </div>
        <input v-model="refSearch" class="ref-search" placeholder="搜索题目、备注或文件名" />
        <div class="ref-help">最多引用 3 篇已解析论文。发送时会和当前论文一起作为上下文。</div>
        <div class="ref-list">
          <button
            v-for="p in filteredRefPapers"
            :key="p.id"
            class="ref-row"
            :class="{ selected: selectedRefIds.includes(p.id), disabled: p.state !== 'done' }"
            :disabled="p.state !== 'done' || (!selectedRefIds.includes(p.id) && selectedRefIds.length >= MAX_REF_PAPERS)"
            @click="toggleRefPaper(p.id)"
          >
            <span class="ref-mark">{{ selectedRefIds.includes(p.id) ? '✓' : '' }}</span>
            <span class="ref-main">
              <span class="ref-title">{{ paperTitle(p) }}</span>
              <span class="ref-meta">{{ p.state === 'done' ? '已解析' : (p.stateText || p.state || '未解析') }}</span>
            </span>
          </button>
        </div>
        <div class="ref-picker-actions">
          <button class="btn small" @click="selectedRefIds = []">清除</button>
          <button class="btn small primary" @click="showRefPicker = false">完成</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, watch, nextTick, shallowRef, onMounted, onUnmounted, computed } from 'vue';
import { useChatStore } from '../stores/chat.js';
import { usePapersStore } from '../stores/papers.js';
import { useConfigStore } from '../stores/config.js';
import { parseMarkdown, parseMarkdownWithMath } from '../lib/render.js';
import * as store from '../lib/store.js';
import ModelSwitcher from './ModelSwitcher.vue';

const emit = defineEmits(['close']);
const chat = useChatStore();
const papers = usePapersStore();
const cfg = useConfigStore();

const MIN_WIDTH = 200;
const DEFAULT_WIDTH = 340;
const MAX_REF_PAPERS = 3;

const width = ref(DEFAULT_WIDTH);
const inputMsg = ref('');
const pendingImages = ref([]);
const streamingReply = ref('');
const streamingHtml = shallowRef('<span class="cursor">▌</span>');
const msgBox = ref(null);
const panelEl = ref(null);
const resizerEl = ref(null);
const inputEl = ref(null);
const editingTitle = ref(false);
const titleDraft = ref('');
const titleInput = ref(null);
const previewSrc = ref(null);
const showRefPicker = ref(false);
const refSearch = ref('');
const selectedRefIds = ref([]);
const bubbleCache = new WeakMap();
let layoutBusyTimer = 0;
let layoutFrame = 0;

function maxPanelWidth() {
  return Math.max(MIN_WIDTH, Math.min(window.innerWidth * 0.7, 900));
}

function clampPanelWidth(value) {
  return Math.min(Math.max(MIN_WIDTH, value), maxPanelWidth());
}

function setOverlayWidth(value) {
  document.documentElement.style.setProperty('--chat-overlay-width', `${Math.ceil(clampPanelWidth(value))}px`);
}

function setLayoutBusy(active) {
  clearTimeout(layoutBusyTimer);
  layoutBusyTimer = 0;
  document.documentElement.classList.toggle('chat-layout-busy', active);
}

function scheduleOverlayWidth(value) {
  const nextValue = clampPanelWidth(value);
  setLayoutBusy(true);
  if (layoutFrame) cancelAnimationFrame(layoutFrame);
  layoutFrame = requestAnimationFrame(() => {
    layoutFrame = requestAnimationFrame(() => {
      layoutFrame = 0;
      setOverlayWidth(nextValue);
      layoutBusyTimer = window.setTimeout(() => setLayoutBusy(false), 180);
    });
  });
}

function onMsgClick(e) {
  if (e.target.tagName === 'IMG') previewSrc.value = e.target.src;
}

function paperTitle(p) {
  return p?.remark || p?.title || p?.fileName || '未命名论文';
}

const selectedRefPapers = computed(() => selectedRefIds.value
  .map((id) => papers.papers.find((p) => p.id === id))
  .filter(Boolean));

const lastAssistantIndex = computed(() => {
  const messages = chat.session?.messages || [];
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'assistant') return i;
  }
  return -1;
});

const activeModelLabel = computed(() => {
  const provider = cfg.currentProvider?.name || 'AI';
  return cfg.aiModel ? `${provider} / ${cfg.aiModel}` : provider;
});

const filteredRefPapers = computed(() => {
  const query = refSearch.value.trim().toLowerCase();
  return papers.papers
    .filter((p) => p.id !== papers.currentId)
    .filter((p) => {
      if (!query) return true;
      return [paperTitle(p), p.title, p.fileName, p.remark]
        .some((v) => String(v || '').toLowerCase().includes(query));
    });
});

function toggleRefPaper(id) {
  const paper = papers.papers.find((p) => p.id === id);
  if (!paper || paper.state !== 'done') return;
  if (selectedRefIds.value.includes(id)) {
    selectedRefIds.value = selectedRefIds.value.filter((pid) => pid !== id);
    return;
  }
  if (selectedRefIds.value.length >= MAX_REF_PAPERS) return;
  selectedRefIds.value = [...selectedRefIds.value, id];
}

function refsByIds(ids) {
  return ids
    .map((id) => papers.papers.find((p) => p.id === id))
    .filter(Boolean)
    .slice(0, MAX_REF_PAPERS);
}

async function loadReferenceContexts(ids = selectedRefIds.value) {
  const contexts = [];
  for (const p of refsByIds(ids)) {
    const md = await store.loadMarkdown(p.id).catch(() => null);
    if (md) contexts.push({ id: p.id, title: paperTitle(p), md });
  }
  return contexts;
}

function startDrag(e) {
  e.preventDefault();
  const panel = panelEl.value;
  const resizer = resizerEl.value;
  if (!panel) return;
  const panelRect = panel.getBoundingClientRect();
  const startX = e.clientX;
  const startW = clampPanelWidth(panelRect.width || width.value);
  let frame = 0;
  let nextWidth = startW;
  setLayoutBusy(true);
  resizer?.classList.add('dragging');
  const flushWidth = () => {
    frame = 0;
    panel.style.width = `${nextWidth}px`;
  };
  const onMove = (ev) => {
    nextWidth = clampPanelWidth(startW - (ev.clientX - startX));
    if (!frame) frame = requestAnimationFrame(flushWidth);
  };
  const onUp = () => {
    if (frame) cancelAnimationFrame(frame);
    resizer?.classList.remove('dragging');
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    document.removeEventListener('mouseleave', onUp);
    width.value = nextWidth;
    panel.style.width = `${nextWidth}px`;
    scheduleOverlayWidth(nextWidth);
  };
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
  document.addEventListener('mouseleave', onUp);
}

function startEdit() {
  titleDraft.value = chat.session?.title || '';
  editingTitle.value = true;
  nextTick(() => titleInput.value?.focus());
}

function commitEdit() {
  if (titleDraft.value.trim()) chat.renameSession(titleDraft.value.trim());
  editingTitle.value = false;
}

function msgRole(msg) { return msg.role; }

function getMsgText(msg) {
  return Array.isArray(msg.content)
    ? msg.content.find((c) => c.type === 'text')?.text || ''
    : msg.content;
}

function copy(msg, fmt) {
  const md = getMsgText(msg);
  let text = md;
  if (fmt === 'text') {
    const el = document.createElement('div');
    el.innerHTML = parseMarkdown(md);
    text = el.innerText;
  }
  navigator.clipboard.writeText(text);
}

function formatDuration(ms) {
  if (!ms) return '';
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(ms < 10000 ? 1 : 0)}s`;
}

function formatUsage(usage) {
  if (!usage) return '';
  const tokens = usage.total_tokens || usage.completion_tokens || usage.output_tokens;
  if (!tokens) return '';
  return `${usage.estimated ? '约 ' : ''}${tokens} tokens`;
}

function msgMetaText(msg) {
  const meta = msg?.meta || {};
  const parts = [];
  if (meta.error) parts.push('错误');
  else if (meta.canceled) parts.push('已取消');
  if (meta.model) parts.push(meta.model);
  const duration = formatDuration(meta.durationMs);
  if (duration) parts.push(duration);
  const usage = formatUsage(meta.usage);
  if (usage) parts.push(usage);
  if (meta.refIds?.length) parts.push(`引用 ${meta.refIds.length}`);
  return parts.join(' · ');
}

function renderBubble(msg) {
  const text = getMsgText(msg);
  if (msg.role === 'assistant') {
    const cached = bubbleCache.get(msg);
    if (cached?.text === text) return cached.html;
    const html = parseMarkdownWithMath(text);
    bubbleCache.set(msg, { text, html });
    return html;
  }
  let html = escHtml(text);
  if (Array.isArray(msg.content)) {
    msg.content.filter((c) => c.type === 'image_url').forEach((c) => {
      html += `<img src="${c.image_url.url}" class="chat-sent-img" />`;
    });
  }
  return html;
}

function escHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function resetStreaming() {
  streamingReply.value = ' ';
  streamingHtml.value = '<span class="cursor">▌</span>';
}

function appendStreamingChunk(chunk) {
  streamingReply.value = (streamingReply.value.trim() ? streamingReply.value : '') + chunk;
  streamingHtml.value = parseMarkdownWithMath(streamingReply.value) + '<span class="cursor">▌</span>';
  nextTick(() => { if (msgBox.value) msgBox.value.scrollTop = msgBox.value.scrollHeight; });
}

function clearStreaming() {
  streamingReply.value = '';
  streamingHtml.value = '<span class="cursor">▌</span>';
  nextTick(() => { if (msgBox.value) msgBox.value.scrollTop = msgBox.value.scrollHeight; });
}

async function send() {
  const msg = inputMsg.value.trim();
  const images = [...pendingImages.value];
  if (!msg && !images.length) return;
  inputMsg.value = '';
  pendingImages.value = [];
  resetStreaming();

  try {
    const refIds = [...selectedRefIds.value];
    const extraContexts = await loadReferenceContexts(refIds);
    await chat.send(msg, images, appendStreamingChunk, { extraContexts, refIds });
  } catch {
    // chat store 已经写入错误消息，这里只负责收起流式占位。
  } finally {
    clearStreaming();
  }
}

async function regenerateLast() {
  if (chat.busy) return;
  resetStreaming();
  try {
    const last = chat.session?.messages?.[lastAssistantIndex.value];
    const refIds = last?.meta?.refIds || [];
    const extraContexts = await loadReferenceContexts(refIds);
    await chat.regenerateLast(appendStreamingChunk, { extraContexts, refIds });
  } catch {
    // chat store 已经写入错误消息。
  } finally {
    clearStreaming();
  }
}

function onPaste(e) {
  const items = [...(e.clipboardData?.items || [])].filter((i) => i.type.startsWith('image/'));
  if (!items.length) return;
  e.preventDefault();
  items.forEach((item) => {
    const reader = new FileReader();
    reader.onload = (ev) => pendingImages.value.push(ev.target.result);
    reader.readAsDataURL(item.getAsFile());
  });
}

watch(() => chat.session?.messages?.length, () => {
  nextTick(() => { if (msgBox.value) msgBox.value.scrollTop = msgBox.value.scrollHeight; });
});

watch(() => papers.currentId, () => {
  selectedRefIds.value = selectedRefIds.value.filter((id) => id !== papers.currentId);
});

function syncPanelBounds() {
  const nextWidth = clampPanelWidth(width.value);
  width.value = nextWidth;
  if (panelEl.value) panelEl.value.style.width = `${nextWidth}px`;
  setOverlayWidth(nextWidth);
}

onMounted(() => {
  syncPanelBounds();
  window.addEventListener('resize', syncPanelBounds);
});

onUnmounted(() => {
  window.removeEventListener('resize', syncPanelBounds);
  if (layoutFrame) cancelAnimationFrame(layoutFrame);
  clearTimeout(layoutBusyTimer);
  document.documentElement.classList.remove('chat-layout-busy');
  document.documentElement.style.removeProperty('--chat-overlay-width');
});

defineExpose({
  addPendingImage(dataUrl) {
    pendingImages.value.push(dataUrl);
  },
  addPrefillText(text) {
    inputMsg.value = text;
    nextTick(() => inputEl.value?.focus());
  },
});
</script>

<style scoped>
.chat-shell {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  z-index: 80;
  display: flex;
  min-width: 200px;
  max-width: min(70vw, 900px);
  box-shadow: -4px 0 16px rgba(0,0,0,.08);
}
.resizer {
  position: absolute;
  top: 0;
  bottom: 0;
  left: -3px;
  width: 6px;
  z-index: 2;
  background: var(--border);
  cursor: col-resize;
  transition: background .15s;
}
.resizer:hover, .resizer.dragging { background: var(--primary); }
.chat-panel { display: flex; flex-direction: column; background: var(--panel); overflow: hidden; width: 100%; min-width: 200px; }
.chat-head { display: flex; align-items: center; gap: 6px; padding: 10px 12px; border-bottom: 1px solid var(--border); font-weight: 600; font-size: 14px; }
.chat-title { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; cursor: pointer; font-size: 13px; }
.chat-title:hover { color: var(--primary); }
.chat-title-input { flex: 1; border: 1px solid var(--primary); border-radius: 5px; padding: 2px 6px; font-size: 13px; outline: none; }
.chat-input-bar {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
}
.ref-tool-btn {
  height: 30px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border: 1px solid var(--border);
  background: #f7f8fa;
  color: var(--text);
  border-radius: 8px;
  padding: 0 9px;
  font-size: 12px;
  line-height: 1;
  cursor: pointer;
  white-space: nowrap;
  transition: border-color .15s, background .15s, color .15s, box-shadow .15s;
}
.ref-tool-btn:hover {
  border-color: #b8c2d2;
  background: #fff;
}
.ref-tool-btn.active {
  color: var(--primary);
  border-color: #c6d1ff;
  background: #eef1ff;
}
.ref-tool-icon {
  font-size: 13px;
  line-height: 1;
  transform: translateY(-1px);
}
.ref-tool-count {
  min-width: 17px;
  height: 17px;
  border-radius: 999px;
  background: var(--primary);
  color: #fff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: 600;
}
.chat-input-bar :deep(.model-switcher) { min-width: 0; }
.chat-input-bar .btn.primary,
.chat-input-bar .stop-btn {
  height: 30px;
  align-self: stretch;
  padding: 0 13px;
  border-radius: 8px;
  font-size: 13px;
}
.chat-input-bar .stop-btn {
  background: var(--red);
  color: #fff;
  border-color: var(--red);
}
.chat-input-bar .stop-btn:hover {
  background: #c62f2f;
  border-color: #c62f2f;
}
.chat-messages { flex: 1; overflow-y: auto; padding: 14px; display: flex; flex-direction: column; gap: 12px; }
.chat-msg { display: flex; flex-direction: column; gap: 4px; max-width: 92%; }
.chat-msg.user { align-self: flex-end; align-items: flex-end; }
.chat-msg.assistant { align-self: flex-start; }
.copy-bar {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 4px;
  flex-wrap: wrap;
}
.msg-meta {
  color: var(--muted);
  font-size: 11px;
  margin-right: auto;
  line-height: 1.8;
}
.copy-btn {
  font-size: 11px; padding: 2px 8px; border-radius: 4px;
  border: 1px solid var(--border); background: var(--panel);
  cursor: pointer; color: var(--muted); transition: .12s;
}
.copy-bar .copy-btn {
  opacity: 0;
  pointer-events: none;
}
.chat-msg:hover .copy-bar .copy-btn {
  opacity: 1;
  pointer-events: auto;
}
.copy-btn:hover { background: #f0f1f3; color: var(--text); }
.copy-btn:disabled { opacity: .5; cursor: not-allowed; }
.stream-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
  color: var(--muted);
  font-size: 11px;
}
.stream-head span { margin-right: auto; }
.chat-bubble { padding: 10px 13px; border-radius: 10px; font-size: 14px; line-height: 1.6; white-space: pre-wrap; word-break: break-word; }
.chat-bubble.user { background: var(--primary); color: #fff; border-radius: 10px 2px 10px 10px; white-space: normal; }
.chat-bubble.assistant { background: #f0f1f3; color: var(--text); border-radius: 2px 10px 10px 10px; white-space: normal; }
.chat-bubble.assistant :deep(p) { margin: .4em 0; }
.chat-bubble.assistant :deep(pre) { background: #e8eaed; padding: 10px; border-radius: 6px; overflow-x: auto; font-size: .85em; white-space: pre; }
.chat-bubble.assistant :deep(code) { font-size: .85em; }
.chat-bubble.assistant :deep(:not(pre) > code) { background: #dde0e4; padding: 1px 4px; border-radius: 3px; }
.chat-bubble.assistant :deep(ul), .chat-bubble.assistant :deep(ol) { padding-left: 18px; margin: .4em 0; }
.chat-bubble.assistant :deep(h1), .chat-bubble.assistant :deep(h2), .chat-bubble.assistant :deep(h3) { margin: .5em 0 .3em; font-size: 1em; font-weight: 600; }
.chat-input-wrap { padding: 12px; border-top: 1px solid var(--border); display: flex; flex-direction: column; gap: 8px; }
.ref-strip { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.ref-count { font-size: 11px; color: var(--muted); }
.ref-chip, .ref-clear {
  border: 1px solid var(--border);
  background: #f6f7f9;
  color: var(--text);
  border-radius: 999px;
  padding: 2px 7px;
  font-size: 11px;
  cursor: pointer;
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ref-chip:hover, .ref-clear:hover { background: #eef0f2; }
.ref-clear { color: var(--muted); }
textarea { width: 100%; resize: none; padding: 9px 12px; border: 1px solid var(--border); border-radius: 8px; font-size: 14px; font-family: inherit; line-height: 1.5; outline: none; }
textarea:focus { border-color: var(--primary); }
.chat-input-wrap .btn { align-self: flex-end; }
.chat-img-preview { display: flex; flex-wrap: wrap; gap: 6px; padding: 6px 0; }
.chat-img-thumb { position: relative; display: inline-block; }
.chat-img-thumb img { width: 64px; height: 64px; object-fit: cover; border-radius: 6px; border: 1px solid var(--border); }
.chat-img-thumb button { position: absolute; top: -6px; right: -6px; width: 18px; height: 18px; border-radius: 50%; border: none; background: var(--red); color: #fff; font-size: 10px; cursor: pointer; line-height: 18px; padding: 0; }
:deep(.chat-sent-img) { max-width: 160px; border-radius: 6px; display: block; margin-top: 6px; cursor: zoom-in; }
.img-preview-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,.85);
  display: flex; align-items: center; justify-content: center;
  z-index: 1000; cursor: zoom-out;
}
.img-preview-overlay img { max-width: 90vw; max-height: 90vh; border-radius: 8px; cursor: default; }
.ref-picker-backdrop {
  position: fixed;
  inset: 0;
  z-index: 900;
  background: rgba(0,0,0,.32);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}
.ref-picker {
  width: min(520px, 92vw);
  max-height: min(620px, 86vh);
  background: #fff;
  border-radius: 10px;
  box-shadow: 0 12px 36px rgba(0,0,0,.22);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.ref-picker-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 13px 16px;
  border-bottom: 1px solid var(--border);
  font-weight: 600;
  font-size: 14px;
}
.close-btn { border: none; background: transparent; cursor: pointer; font-size: 20px; line-height: 1; color: var(--muted); }
.close-btn:hover { color: var(--text); }
.ref-search {
  margin: 12px 14px 6px;
  border: 1px solid var(--border);
  border-radius: 7px;
  padding: 8px 10px;
  outline: none;
  font-size: 13px;
}
.ref-search:focus { border-color: var(--primary); }
.ref-help { padding: 0 14px 8px; font-size: 12px; color: var(--muted); line-height: 1.4; }
.ref-list { overflow-y: auto; padding: 4px 8px 10px; }
.ref-row {
  width: 100%;
  border: none;
  background: transparent;
  display: flex;
  align-items: flex-start;
  gap: 9px;
  padding: 9px 8px;
  border-radius: 7px;
  cursor: pointer;
  text-align: left;
}
.ref-row:hover { background: #f0f1f3; }
.ref-row.selected { background: #eef1ff; }
.ref-row.disabled { opacity: .55; cursor: not-allowed; }
.ref-mark {
  width: 18px;
  height: 18px;
  border: 1px solid var(--border);
  border-radius: 5px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--primary);
  font-size: 12px;
  flex-shrink: 0;
  margin-top: 1px;
}
.ref-main { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.ref-title { font-size: 13px; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ref-meta { font-size: 11px; color: var(--muted); }
.ref-picker-actions {
  border-top: 1px solid var(--border);
  padding: 10px 14px;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.cursor { animation: blink .7s step-end infinite; }
@keyframes blink { 50% { opacity: 0; } }
</style>
