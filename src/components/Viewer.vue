<template>
  <section class="viewer">
    <div class="viewer-head">
      <h1 class="viewer-title">{{ title }}</h1>
      <div class="view-tabs">
        <button class="tab" :class="{ active: view === 'md' }" @click="view = 'md'">Markdown</button>
        <button class="tab" :class="{ active: view === 'pdf' }" @click="view = 'pdf'">原文 PDF</button>
      </div>
      <button class="btn small" @click="$emit('toggleChat')">💬 AI 助手</button>
    </div>

    <div v-if="paper && paper.state !== 'done'" class="status-bar" :class="{ failed: paper.state === 'failed' }">
      <span>{{ paper.stateText || paper.state }}</span>
      <div class="progress"><div class="progress-fill" :style="{ width: (paper.progress || 0) + '%' }" /></div>
    </div>

    <div class="viewer-body">
      <article v-show="view === 'md'" ref="mdBox" class="md-view markdown-body">
        <div v-if="!paper" class="placeholder">选择或上传一篇论文以查看解析结果</div>
        <div v-else-if="paper.state === 'failed'" class="placeholder error">解析失败：{{ paper.error }}</div>
        <div v-else-if="paper.state !== 'done'" class="placeholder">解析完成后将在此显示 Markdown 内容</div>
      </article>
      <div v-show="view === 'pdf'" class="pdf-wrap">
        <iframe ref="pdfFrame" title="PDF 预览" />
      </div>
    </div>
  </section>
</template>

<script setup>
import { ref, watch, computed } from 'vue';
import { usePapersStore } from '../stores/papers.js';
import { renderMarkdown } from '../lib/render.js';
import * as store from '../lib/store.js';

const emit = defineEmits(['toggleChat']);
const papers = usePapersStore();
const view = ref('md');
const mdBox = ref(null);
const pdfFrame = ref(null);

const paper = computed(() => papers.currentPaper);
const title = computed(() => paper.value?.title || '未选择论文');

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
</style>
