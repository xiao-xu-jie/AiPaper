<template>
  <div class="resizer" :class="{ dragging }" @mousedown="startDrag" />
  <aside class="chat-panel" :style="{ width: width + 'px' }">
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
            <button class="copy-btn" @click="copy(msg, 'md')">复制 MD</button>
            <button class="copy-btn" @click="copy(msg, 'text')">复制纯文本</button>
          </div>
        </div>
      </template>
      <div v-if="chat.busy" class="chat-msg assistant">
        <div class="chat-bubble assistant" v-html="streamingReply ? parseMarkdown(streamingReply) + '<span class=\'cursor\'>▌</span>' : '<span class=\'cursor\'>▌</span>'" />
      </div>
    </div>

    <div class="chat-input-wrap">
      <div v-if="pendingImages.length" class="chat-img-preview">
        <div v-for="(src, i) in pendingImages" :key="i" class="chat-img-thumb">
          <img :src="src" />
          <button @click="pendingImages.splice(i, 1)">✕</button>
        </div>
      </div>
      <textarea
        ref="inputEl"
        v-model="inputMsg"
        rows="3"
        placeholder="向 AI 提问（Shift+Enter 换行，Enter 发送）"
        @keydown.enter.exact.prevent="send"
        @paste="onPaste"
      />
      <button class="btn primary" :disabled="chat.busy" @click="send">发送</button>
    </div>
  </aside>

  <Teleport to="body">
    <div v-if="previewSrc" class="img-preview-overlay" @click="previewSrc = null">
      <img :src="previewSrc" @click.stop />
    </div>
  </Teleport>
</template>

<script setup>
import { ref, watch, nextTick } from 'vue';
import { useChatStore } from '../stores/chat.js';
import { parseMarkdown } from '../lib/render.js';

const emit = defineEmits(['close']);
const chat = useChatStore();

const width = ref(340);
const dragging = ref(false);
const inputMsg = ref('');
const pendingImages = ref([]);
const streamingReply = ref('');
const msgBox = ref(null);
const inputEl = ref(null);
const editingTitle = ref(false);
const titleDraft = ref('');
const titleInput = ref(null);
const previewSrc = ref(null);

function onMsgClick(e) {
  if (e.target.tagName === 'IMG') previewSrc.value = e.target.src;
}

function startDrag(e) {
  e.preventDefault();
  const startX = e.clientX, startW = width.value;
  dragging.value = true;
  const onMove = (ev) => { width.value = Math.max(200, startW - (ev.clientX - startX)); };
  const onUp = () => { dragging.value = false; document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
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

function renderBubble(msg) {
  const text = getMsgText(msg);
  if (msg.role === 'assistant') return parseMarkdown(text);
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

async function send() {
  const msg = inputMsg.value.trim();
  const images = [...pendingImages.value];
  if (!msg && !images.length) return;
  inputMsg.value = '';
  pendingImages.value = [];
  streamingReply.value = ' '; // 立刻显示光标占位

  try {
    await chat.send(msg, images, (chunk) => {
      streamingReply.value = (streamingReply.value.trim() ? streamingReply.value : '') + chunk;
      nextTick(() => { if (msgBox.value) msgBox.value.scrollTop = msgBox.value.scrollHeight; });
    });
  } catch (e) {
    chat.session?.messages.push({ role: 'assistant', content: `[错误] ${e.message}` });
  } finally {
    streamingReply.value = '';
    nextTick(() => { if (msgBox.value) msgBox.value.scrollTop = msgBox.value.scrollHeight; });
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

defineExpose({
  addPendingImage(dataUrl) {
    pendingImages.value.push(dataUrl);
  },
});
</script>

<style scoped>
.resizer { width: 5px; flex-shrink: 0; background: var(--border); cursor: col-resize; transition: background .15s; }
.resizer:hover, .resizer.dragging { background: var(--primary); }
.chat-panel { display: flex; flex-direction: column; background: var(--panel); overflow: hidden; flex-shrink: 0; min-width: 200px; }
.chat-head { display: flex; align-items: center; gap: 6px; padding: 10px 12px; border-bottom: 1px solid var(--border); font-weight: 600; font-size: 14px; }
.chat-title { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; cursor: pointer; font-size: 13px; }
.chat-title:hover { color: var(--primary); }
.chat-title-input { flex: 1; border: 1px solid var(--primary); border-radius: 5px; padding: 2px 6px; font-size: 13px; outline: none; }
.chat-messages { flex: 1; overflow-y: auto; padding: 14px; display: flex; flex-direction: column; gap: 12px; }
.chat-msg { display: flex; flex-direction: column; gap: 4px; max-width: 92%; }
.chat-msg.user { align-self: flex-end; align-items: flex-end; }
.chat-msg.assistant { align-self: flex-start; }
.copy-bar { display: none; gap: 4px; margin-top: 4px; }
.chat-msg:hover .copy-bar { display: flex; }
.copy-btn {
  font-size: 11px; padding: 2px 8px; border-radius: 4px;
  border: 1px solid var(--border); background: var(--panel);
  cursor: pointer; color: var(--muted); transition: .12s;
}
.copy-btn:hover { background: #f0f1f3; color: var(--text); }
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
.cursor { animation: blink .7s step-end infinite; }
@keyframes blink { 50% { opacity: 0; } }
</style>
