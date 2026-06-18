<template>
  <div v-if="!supported" class="overlay">
    <div class="overlay-card">
      <h2>需要安全连接</h2>
      <p>File System Access API 要求页面通过 <strong>HTTPS</strong> 或 <strong>localhost</strong> 访问。</p>
      <p style="margin-top:8px">请为服务器配置 HTTPS 证书后重试，或使用 Chrome / Edge 桌面版通过 HTTPS 访问。</p>
    </div>
  </div>

  <TopBar @upload="triggerUpload" @pickDir="pickDir" />

  <div v-if="restoreHandle" class="restore-bar">
    <span>检测到上次使用的数据文件夹，是否恢复历史数据？</span>
    <button class="btn primary small" @click="grantRestore">恢复</button>
  </div>

  <div v-if="!dirReady" class="need-dir">
    <div class="nd-card">
      <h2>开始使用</h2>
      <ol>
        <li>点击顶部「⚙️ MinerU」配置 Token，保存后点「📁 选择数据文件夹」</li>
        <li>（可选）点击「🤖 AI 模型」配置 AI 助手和笔记生成</li>
        <li>上传 PDF 论文，等待解析完成即可在线预览</li>
      </ol>
      <p class="hint">所有数据保存在你选择的文件夹中，下次自动加载。</p>
    </div>
  </div>

  <main v-if="dirReady" class="main" @dragover.prevent @dragenter.prevent="dropOver = true" @dragleave="dropOver = false" @drop.prevent="onDrop">
    <Sidebar />
    <Viewer :key="papers.currentId" @toggleChat="toggleChat" @askImage="onAskImage" @askText="onAskText" />
    <ChatPanel v-if="chatOpen" ref="chatPanelRef" @close="chatOpen = false" />
    <div v-if="dropOver" class="drop-zone over" />
  </main>

  <SessionPicker v-if="chatStore.showPicker" />

  <div class="toast" :class="toastState.cls" :style="{ opacity: toastState.show ? 1 : 0 }">{{ toastState.msg }}</div>

  <footer class="footer">© 2026 小徐. All rights reserved.</footer>

  <input ref="fileInput" type="file" accept="application/pdf" multiple hidden @change="onFileInput" />
</template>

<script setup>
import { ref, onMounted, provide, nextTick } from 'vue';
import TopBar from './components/TopBar.vue';
import Sidebar from './components/Sidebar.vue';
import Viewer from './components/Viewer.vue';
import ChatPanel from './components/ChatPanel.vue';
import SessionPicker from './components/SessionPicker.vue';
import { useConfigStore } from './stores/config.js';
import { usePapersStore } from './stores/papers.js';
import { useChatStore } from './stores/chat.js';
import * as store from './lib/store.js';
import * as agentLib from './lib/agent.js';

const supported = ref(store.isSupported());
const dirReady = ref(false);
const restoreHandle = ref(null);
const chatOpen = ref(false);
const dropOver = ref(false);
const fileInput = ref(null);
const toastState = ref({ msg: '', cls: '', show: false });

const cfg = useConfigStore();
const papers = usePapersStore();
const chatStore = useChatStore();

function toast(msg, type = 'info') {
  toastState.value = { msg, cls: type, show: true };
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { toastState.value.show = false; }, 3500);
}
provide('toast', toast);

onMounted(async () => {
  await cfg.init();
  const handle = await store.restoreDirectory();
  if (handle) {
    if (store.getRoot()) {
      await afterDirReady();
    } else {
      // 尝试静默恢复权限（部分浏览器/Electron 支持无手势授权）
      const ok = await store.ensurePermission(handle).catch(() => false);
      if (ok) {
        await afterDirReady();
      } else {
        restoreHandle.value = handle;
        window.__pendingHandle = handle;
      }
    }
  }
});

async function afterDirReady() {
  dirReady.value = true;
  restoreHandle.value = null;
  await papers.refresh();
}

async function pickDir() {
  try {
    await store.pickDirectory();
    await afterDirReady();
    toast('数据文件夹已就绪', 'success');
  } catch (e) {
    if (e.name !== 'AbortError') toast('选择文件夹失败：' + e.message, 'error');
  }
}

async function grantRestore() {
  const ok = await store.ensurePermission(window.__pendingHandle);
  if (ok) { await afterDirReady(); toast('已恢复历史数据', 'success'); }
  else toast('授权被拒绝', 'error');
}

function triggerUpload() {
  if (!dirReady.value) { toast('请先选择数据文件夹', 'error'); return; }
  if (!cfg.token) { toast('请先配置 MinerU Token', 'error'); return; }
  fileInput.value.click();
}

async function onFileInput(e) {
  const files = [...(e.target.files || [])].filter((f) => /\.pdf$/i.test(f.name));
  e.target.value = '';
  if (!files.length) return;
  try {
    await papers.upload(files, cfg);
    toast(`上传完成`, 'success');
  } catch (e) { toast('失败：' + e.message, 'error'); }
}

function onDrop(e) {
  dropOver.value = false;
  const files = [...(e.dataTransfer?.files || [])].filter((f) => /\.pdf$/i.test(f.name));
  if (files.length) onFileInput({ target: { files }, value: '' });
}

const chatPanelRef = ref(null);
const pendingAskText = ref(null);
const pendingAskImage = ref(null);

async function toggleChat() {
  if (chatOpen.value) { chatOpen.value = false; return; }
  if (!papers.currentId) return;
  if (!cfg.aiUrl || !cfg.aiModel) { toast('请先配置 AI 接口地址和模型', 'error'); return; }
  agentLib.setContext(papers.currentMd || '');
  const needPick = await chatStore.loadForPaper(papers.currentId);
  if (!needPick) chatOpen.value = true;
}

async function onAskText(text) {
  if (!cfg.aiUrl || !cfg.aiModel) { toast('请先配置 AI 接口地址和模型', 'error'); return; }
  if (!chatOpen.value) {
    if (!papers.currentId) return;
    agentLib.setContext(papers.currentMd || '');
    const needPick = await chatStore.loadForPaper(papers.currentId);
    if (needPick) { pendingAskText.value = text; return; }
    chatOpen.value = true;
    await nextTick();
  }
  chatPanelRef.value?.addPrefillText(text);
}

async function onAskImage(dataUrl) {
  if (!cfg.aiUrl || !cfg.aiModel) { toast('请先配置 AI 接口地址和模型', 'error'); return; }
  if (!chatOpen.value) {
    if (!papers.currentId) return;
    agentLib.setContext(papers.currentMd || '');
    const needPick = await chatStore.loadForPaper(papers.currentId);
    if (needPick) { pendingAskImage.value = dataUrl; return; }
    chatOpen.value = true;
    await nextTick();
  }
  chatPanelRef.value?.addPendingImage(dataUrl);
}

import { watch } from 'vue';

// picker 关闭（用户选好会话）后 flush pending ask
watch(() => chatStore.showPicker, async (val) => {
  if (val) return; // 打开时不处理
  if (!chatStore.session) return; // 没选，不处理
  chatOpen.value = true;
  await nextTick();
  if (pendingAskText.value !== null) {
    chatPanelRef.value?.addPrefillText(pendingAskText.value);
    pendingAskText.value = null;
  }
  if (pendingAskImage.value !== null) {
    chatPanelRef.value?.addPendingImage(pendingAskImage.value);
    pendingAskImage.value = null;
  }
});
watch(() => papers.currentId, (id) => {
  agentLib.setContext(papers.currentMd || '');
  if (chatOpen.value && id) {
    chatStore.loadForPaper(id).then(() => { agentLib.setContext(papers.currentMd || ''); });
  }
});
watch(() => papers.currentMd, (md) => { agentLib.setContext(md || ''); });
</script>

<style scoped>
.main { flex: 1; display: flex; overflow: hidden; position: relative; }
.need-dir { flex: 1; display: flex; align-items: center; justify-content: center; }
.nd-card { background: var(--panel); border: 1px solid var(--border); border-radius: 12px; padding: 32px 40px; box-shadow: var(--shadow); max-width: 480px; }
.nd-card h2 { margin-bottom: 16px; }
.nd-card ol { margin-left: 20px; line-height: 2; }
.nd-card .hint { margin-top: 16px; font-size: 13px; color: var(--muted); }
.restore-bar { display: flex; align-items: center; gap: 12px; padding: 10px 20px; background: #fff7e6; border-bottom: 1px solid #ffe8b3; font-size: 14px; flex-shrink: 0; }
.drop-zone { position: absolute; inset: 0; pointer-events: none; }
.drop-zone.over { pointer-events: all; background: rgba(59,91,219,.08); border: 3px dashed var(--primary); z-index: 50; }
.overlay { position: fixed; inset: 0; background: rgba(0,0,0,.5); display: flex; align-items: center; justify-content: center; z-index: 100; }
.overlay-card { background: #fff; padding: 32px 40px; border-radius: 12px; max-width: 420px; }
.overlay-card h2 { margin-bottom: 12px; }
.overlay-card p { color: var(--muted); line-height: 1.6; }
.toast { position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%) translateY(0); background: #2b2f36; color: #fff; padding: 12px 22px; border-radius: 8px; font-size: 14px; pointer-events: none; transition: opacity .25s; z-index: 200; }
.toast.success { background: var(--green); }
.toast.error { background: var(--red); }
.footer { text-align: center; padding: 10px 20px; font-size: 12px; color: var(--muted); background: var(--panel); border-top: 1px solid var(--border); flex-shrink: 0; }
</style>
