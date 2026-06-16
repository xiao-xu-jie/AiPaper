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

    <div v-if="generating" class="notes-generating">
      <div class="gen-bubble markdown-body" v-html="parseMarkdown(streamText) + '<span class=\'cursor\'>▌</span>'" />
    </div>

    <textarea
      v-if="!generating && mode === 'edit'"
      v-model="noteText"
      class="notes-editor"
      placeholder="尚无笔记，点击「AI 生成笔记」自动生成，或直接在此编辑..."
    />
    <article
      v-if="!generating && mode === 'preview'"
      class="notes-preview markdown-body"
      v-html="parseMarkdown(noteText)"
    />
  </div>
</template>

<script setup>
import { ref, watch } from 'vue';
import { usePapersStore } from '../stores/papers.js';
import { useConfigStore } from '../stores/config.js';
import { parseMarkdown } from '../lib/render.js';
import * as store from '../lib/store.js';
import * as agent from '../lib/agent.js';

const papers = usePapersStore();
const cfg = useConfigStore();

const noteText = ref('');
const mode = ref('edit');
const generating = ref(false);
const streamText = ref('');
const statusText = ref('');

// 加载当前论文笔记
watch(() => papers.currentId, async (id) => {
  noteText.value = '';
  statusText.value = '';
  if (!id) return;
  const saved = await store.loadNote(id).catch(() => null);
  noteText.value = saved || '';
  statusText.value = saved ? '已加载已保存笔记' : '';
}, { immediate: true });

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

模板：
${template}

论文内容（Markdown 格式）：
${papers.currentMd}`;

  generating.value = true;
  streamText.value = '';
  statusText.value = '正在生成...';

  try {
    const result = await agent.chat([], prompt, [], (chunk) => {
      streamText.value += chunk;
    });
    noteText.value = result;
    mode.value = 'preview';
    statusText.value = '生成完成，可继续编辑';
    await store.saveNote(papers.currentId, result);
  } catch (e) {
    statusText.value = '生成失败：' + e.message;
  } finally {
    generating.value = false;
    streamText.value = '';
  }
}

async function save() {
  if (!papers.currentId) return;
  await store.saveNote(papers.currentId, noteText.value);
  statusText.value = '已保存';
}
</script>

<style scoped>
.notes-wrap { display: flex; flex-direction: column; height: 100%; overflow: hidden; background: #fff; }
.notes-toolbar {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 20px; border-bottom: 1px solid var(--border); flex-shrink: 0;
}
.notes-status { flex: 1; font-size: 12px; color: var(--muted); }
.btn.active { background: var(--primary); color: #fff; border-color: var(--primary); }
.notes-editor {
  flex: 1; resize: none; border: none; outline: none;
  padding: 24px 40px; font-family: "SF Mono", Consolas, monospace;
  font-size: 14px; line-height: 1.8; overflow-y: auto;
}
.notes-preview { flex: 1; overflow-y: auto; padding: 24px 40px; line-height: 1.7; }
.notes-generating { flex: 1; overflow-y: auto; padding: 24px 40px; }
.gen-bubble { line-height: 1.7; }
.cursor { animation: blink .7s step-end infinite; }
@keyframes blink { 50% { opacity: 0; } }
</style>
