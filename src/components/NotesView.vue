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
      <div ref="streamEl" class="gen-bubble markdown-body" />
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
    />
  </div>
</template>

<script setup>
import { ref, watch, computed, nextTick } from 'vue';
import { usePapersStore } from '../stores/papers.js';
import { useConfigStore } from '../stores/config.js';
import { parseMarkdown, renderMarkdown, renderMath } from '../lib/render.js';
import * as store from '../lib/store.js';
import * as agent from '../lib/agent.js';

const papers = usePapersStore();
const cfg = useConfigStore();

const noteText = ref('');
const mode = ref('edit');
const statusText = ref('');
const previewEl = ref(null);
const streamEl = ref(null);

// generating / streamText 用 store，保证跨 tab 切换不丢失
const generating = computed(() => papers.noteGenerating && papers.noteGeneratingFor === papers.currentId);
const streamText = computed(() => papers.noteStream);

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
