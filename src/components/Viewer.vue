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
      <article v-show="view === 'md'" ref="mdBox" class="md-view markdown-body" @contextmenu="onContextMenu">
        <div v-if="!paper" class="placeholder">选择或上传一篇论文以查看解析结果</div>
        <div v-else-if="paper.state === 'failed'" class="placeholder error">解析失败：{{ paper.error }}</div>
        <div v-else-if="paper.state !== 'done'" class="placeholder">解析完成后将在此显示 Markdown 内容</div>
      </article>
      <div v-show="view === 'pdf'" class="pdf-wrap">
        <iframe ref="pdfFrame" title="PDF 预览" />
      </div>
      <NotesView v-show="view === 'notes'" />
    </div>
  </section>

  <!-- 自定义右键菜单 -->
  <Teleport to="body">
    <div v-if="ctxMenu.show" class="img-ctx-menu" :style="{ left: ctxMenu.x + 'px', top: ctxMenu.y + 'px' }" @click.stop>
      <button v-if="ctxMenu.src" @click="askAboutImage">💬 向 AI 提问此图</button>
      <button v-if="ctxMenu.text" @click="askAboutText">💬 向 AI 提问选中内容</button>
    </div>
    <div v-if="ctxMenu.show" class="ctx-backdrop" @click="ctxMenu.show = false" @contextmenu.prevent="ctxMenu.show = false" />
  </Teleport>
</template>

<script setup>
import { ref, watch, computed, reactive } from 'vue';
import { usePapersStore } from '../stores/papers.js';
import { renderMarkdown } from '../lib/render.js';
import * as store from '../lib/store.js';
import NotesView from './NotesView.vue';

const papers = usePapersStore();

const emit = defineEmits(['toggleChat', 'askImage', 'askText']);
const view = ref('md');
const mdBox = ref(null);
const pdfFrame = ref(null);
const ctxMenu = reactive({ show: false, x: 0, y: 0, src: '', text: '' });

const paper = computed(() => papers.currentPaper);
const title = computed(() => paper.value?.title || '未选择论文');

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
  // 把 img src（object URL 或 data URL）转成 base64 data URL
  const src = ctxMenu.src;
  let dataUrl = src;
  if (!src.startsWith('data:')) {
    const res = await fetch(src);
    const blob = await res.blob();
    dataUrl = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.readAsDataURL(blob);
    });
  }
  emit('askImage', dataUrl);
}

watch(() => papers.currentMd, async (md) => {
  if (!mdBox.value) return;
  if (md && paper.value?.state === 'done') {
    await renderMarkdown(mdBox.value, md, papers.currentId);
  }
});

watch(() => papers.currentId, async (id) => {
  view.value = 'md';
  if (!id || !pdfFrame.value) return;
  const url = await store.getPdfUrl(id).catch(() => null);
  pdfFrame.value.src = url || 'about:blank';
});
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
.viewer-body { flex: 1; overflow: hidden; position: relative; }
.md-view { height: 100%; overflow-y: auto; padding: 32px 48px; background: #fff; line-height: 1.7; }
.md-view .placeholder { color: var(--muted); text-align: center; margin-top: 80px; }
.md-view .placeholder.error { color: var(--red); }
.pdf-wrap { height: 100%; }
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
</style>
