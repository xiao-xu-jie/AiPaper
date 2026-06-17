<template>
  <div class="notes-wrap">
    <div class="notes-toolbar">
      <span class="notes-status">{{ statusText }}</span>
      <button class="btn small" :disabled="generating" @click="generate">
        {{ generating ? '生成中...' : '✨ AI 生成笔记' }}
      </button>
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
import { ref, watch, computed, nextTick, reactive } from 'vue';
import { usePapersStore } from '../stores/papers.js';
import { useConfigStore } from '../stores/config.js';
import { parseMarkdown, renderMarkdown, renderMath } from '../lib/render.js';
import * as store from '../lib/store.js';
import * as agent from '../lib/agent.js';

const papers = usePapersStore();
const cfg = useConfigStore();
const emit = defineEmits(['askImage', 'askText']);

const noteText = ref('');
const mode = ref('edit');
const statusText = ref('');
const previewEl = ref(null);
const streamEl = ref(null);
const ctxMenu = reactive({ show: false, x: 0, y: 0, src: '', text: '' });
const preview = reactive({ show: false, src: '' });
const showOutline = ref(true);
const outline = ref([]);

// generating / streamText 用 store，保证跨 tab 切换不丢失
const generating = computed(() => papers.noteGenerating && papers.noteGeneratingFor === papers.currentId);
const streamText = computed(() => papers.noteStream);

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

// 切换论文时加载对应笔记（后台生成不受影响）
watch(() => papers.currentId, async (id) => {
  noteText.value = '';
  statusText.value = '';
  if (!id) return;
  // 若正在为当前论文生成，显示进行中状态即可
  if (papers.noteGeneratingFor === id) {
    statusText.value = '正在生成...';
    return;
  }
  const saved = await store.loadNote(id).catch(() => null);
  noteText.value = saved || '';
  statusText.value = saved ? '已加载已保存笔记' : '';
  mode.value = saved ? 'preview' : 'edit';
}, { immediate: true });

// 流式生成中：只有当前论文就是生成目标时才更新 DOM
const imgCache = new Map(); // rel path → object URL，避免重复请求导致图片闪烁

watch(streamText, async (text) => {
  if (!streamEl.value || papers.noteGeneratingFor !== papers.currentId) return;
  streamEl.value.innerHTML = parseMarkdown(text) + '<span class="cursor">▌</span>';
  // 用缓存替换已知图片，未缓存的异步获取后存入缓存
  const imgs = streamEl.value.querySelectorAll('img');
  await Promise.all([...imgs].map(async (img) => {
    const src = img.getAttribute('src') || '';
    if (/^(https?:|data:|blob:)/i.test(src)) return;
    const rel = src.replace(/^\.?\//, '');
    if (!imgCache.has(rel)) {
      const { getAssetUrl } = await import('../lib/store.js');
      const url = await getAssetUrl(papers.currentId, rel);
      if (url) imgCache.set(rel, url);
    }
    if (imgCache.has(rel)) img.src = imgCache.get(rel);
    img.loading = 'lazy';
  }));
  renderMath(streamEl.value);
});

watch(() => papers.currentId, () => { imgCache.clear(); }, { flush: 'sync' });

// 预览时用 renderMarkdown 替换图片路径
watch([mode, noteText], async ([m]) => {
  if (m !== 'preview' || !papers.currentId) return;
  await nextTick();
  if (previewEl.value) {
    await renderMarkdown(previewEl.value, noteText.value, papers.currentId);
    outline.value = extractOutline();
  }
});
watch(() => papers.noteGenerating, async (val) => {
  if (!val && papers.noteResult !== null) {
    const { paperId, text } = papers.noteResult;
    papers.noteResult = null;
    if (papers.currentId === paperId) {
      noteText.value = text;
      mode.value = 'preview';
      statusText.value = '生成完成，可继续编辑';
    }
  }
});

async function generate() {
  if (!papers.currentId || !papers.currentMd) {
    statusText.value = '请先选择一篇已解析完成的论文';
    return;
  }
  if (!cfg.aiUrl || !cfg.aiModel) {
    statusText.value = '请先配置 AI 接口地址和模型';
    return;
  }

  const title = papers.currentPaper?.title || '论文';
  const template = cfg.noteTemplate.replace(/\{\{title\}\}/g, title);

  const prompt = `请根据以下论文内容，严格按照给定模板生成一份详细的阅读笔记，使用 Markdown 格式输出，不要有多余解释。

要求：
- 如果论文内容中包含图片（Markdown 格式如 ![...](images/xxx.png)），请在笔记的相关位置原样嵌入对应图片引用，让笔记更直观。

模板：
${template}

论文内容（Markdown 格式）：
${papers.currentMd}`;

  const generatingFor = papers.currentId; // 记录为哪篇生成
  papers.noteGenerating = true;
  papers.noteGeneratingFor = generatingFor;
  papers.noteStream = '';
  statusText.value = '正在生成...';

  try {
    const result = await agent.chat([], prompt, [], (chunk) => {
      papers.noteStream += chunk;
    });
    papers.noteResult = { paperId: generatingFor, text: result };
    await store.saveNote(generatingFor, result);
  } catch (e) {
    if (papers.currentId === generatingFor) statusText.value = '生成失败：' + e.message;
  } finally {
    papers.noteGenerating = false;
    papers.noteGeneratingFor = null;
    papers.noteStream = '';
  }
}

async function save() {
  if (!papers.currentId) return;
  await store.saveNote(papers.currentId, noteText.value);
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
.notes-status { flex: 1; font-size: 12px; color: var(--muted); }
.btn.active { background: var(--primary); color: #fff; border-color: var(--primary); }
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
