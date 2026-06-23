<template>
  <header class="topbar">
    <div class="brand">
      <img src="/assets/logo.png" alt="AI Paper" class="logo" />
      <span class="title">AI Paper</span>
      <span class="subtitle">MinerU 在线解析</span>
    </div>
    <button class="btn secondary" @click="showMinerUConfig = true">⚙️ MinerU</button>
    <button class="btn secondary" @click="showAIConfig = true">🤖 AI 模型</button>
    <button class="btn secondary" @click="showTagManager = true">🏷 标签管理</button>
    <button class="btn secondary" @click="showExtensions = true">🧩 扩展</button>
    <button class="btn secondary" @click="showHelp = true">❓ 帮助</button>
    <button v-if="isElectron" class="btn secondary" @click="handleCheckUpdate">🔄 检查更新</button>
    <button v-if="!isElectron" class="btn secondary" @click="goToDownload">📥 下载客户端</button>
    <button class="btn primary" @click="$emit('upload')">＋ 上传 PDF</button>
  </header>

  <MinerUConfigDialog v-model="showMinerUConfig" @pickDir="$emit('pickDir')" />
  <AIConfigDialog v-model="showAIConfig" />
  <ExtensionsDialog v-model="showExtensions" />

  <Teleport to="body">
    <div v-if="showTagManager" class="tag-manager-overlay" @click="showTagManager = false">
      <div class="tag-manager-modal" @click.stop>
        <div class="tag-manager-header">
          <div>
            <h2>标签管理</h2>
            <p>{{ tagStore.tags.length }} 个标签</p>
          </div>
          <button class="close-btn" @click="showTagManager = false">✕</button>
        </div>

        <div class="tag-manager-tools">
          <input
            v-model="tagSearch"
            class="tag-manager-search"
            placeholder="搜索标签"
            spellcheck="false"
          />
          <div class="tag-manager-add">
            <input
              v-model="tagDraft"
              class="tag-manager-input"
              placeholder="新增标签"
              @keydown.enter.prevent="addManagedTag"
            />
            <button class="btn small primary" @click="addManagedTag">添加</button>
          </div>
        </div>

        <div class="tag-manager-list">
          <div v-for="tag in managedTags" :key="tag.id" class="tag-manager-row">
            <div class="tag-manager-info">
              <span class="tag-manager-name">{{ tag.name }}</span>
              <span class="tag-manager-count">使用 {{ tagUsage(tag.name) }} 篇</span>
            </div>
            <div class="tag-manager-actions">
              <button class="btn small" @click="toggleManagedFilter(tag.name)">
                {{ isTagActive(tag.name) ? '取消筛选' : '筛选' }}
              </button>
              <button
                class="btn small danger-lite"
                :disabled="tagUsage(tag.name) > 0"
                :title="tagUsage(tag.name) > 0 ? '请先从论文中移除该标签' : '删除标签'"
                @click="deleteManagedTag(tag.name)"
              >
                删除
              </button>
            </div>
          </div>
          <div v-if="!managedTags.length" class="tag-manager-empty">暂无标签</div>
        </div>
      </div>
    </div>

    <div v-if="showHelp" class="help-overlay" @click="showHelp = false">
      <div class="help-modal" @click.stop>
        <div class="help-header">
          <h2>使用指南</h2>
          <button class="close-btn" @click="showHelp = false">✕</button>
        </div>
        <div class="help-content">
          <section>
            <h3>1️⃣ 配置 MinerU Token</h3>
            <p>用于 PDF 解析服务</p>
            <ol>
              <li>点击顶部「⚙️ MinerU」按钮打开配置弹窗</li>
              <li>点击 Token 输入框右侧的 🔗 按钮，前往 mineru.net</li>
              <li>在 API 管理页面创建 Token</li>
              <li>复制 Token 粘贴到输入框中，点「保存」</li>
            </ol>
          </section>

          <section>
            <h3>2️⃣ 配置 AI 模型（可选）</h3>
            <p>用于 AI 助手对话和自动生成笔记</p>
            <ul>
              <li>点击顶部「🤖 AI 模型」按钮打开配置弹窗</li>
              <li><strong>选择提供商</strong>：内置免费提供商（OpenCode Zen / Kilo）可直接使用，也可点「+ 提供商」添加自定义</li>
              <li><strong>选择模型</strong>：从下拉列表选择，或点 ↻ 获取模型列表，或点 + 添加自定义模型</li>
              <li>自定义提供商可点 ⚙️ 编辑名称、接口地址、密钥</li>
            </ul>
          </section>

          <section>
            <h3>3️⃣ 选择数据文件夹</h3>
            <p>在「⚙️ MinerU」配置弹窗中点「📁 选择数据文件夹」，选择一个本地文件夹用于存储：</p>
            <ul>
              <li>上传的 PDF 原文</li>
              <li>解析后的 Markdown 内容</li>
              <li>提取的图片资源</li>
              <li>阅读笔记和对话记录</li>
            </ul>
          </section>

          <section>
            <h3>4️⃣ 开始使用</h3>
            <ol>
              <li><strong>上传 PDF</strong>：点击「＋ 上传 PDF」或拖拽文件到页面</li>
              <li><strong>查看内容</strong>：解析完成后可切换 Markdown、原文 PDF、阅读笔记三个标签页</li>
              <li><strong>AI 助手</strong>：点击「💬 AI 助手」或右键选中内容/图片快捷提问</li>
              <li><strong>生成笔记</strong>：切换到阅读笔记标签页，点击「✨ AI 生成笔记」</li>
            </ol>
          </section>

          <section>
            <h3>💡 提示</h3>
            <ul>
              <li>所有数据保存在本地，下次打开自动恢复</li>
              <li>Markdown 和笔记支持图片点击预览、右键复制</li>
              <li>支持查看大纲目录，点击快速跳转</li>
            </ul>
          </section>
        </div>
      </div>
    </div>
    <!-- 更新提示弹窗 -->
    <div v-if="updateAvailable" class="update-overlay" @click="updateAvailable = false">
      <div class="update-modal" @click.stop>
        <h3>🎉 发现新版本</h3>
        <p><strong>当前版本：</strong>{{ currentVersion }}</p>
        <p><strong>最新版本：</strong>{{ latestVersion }}</p>
        <p class="changelog">{{ changelog }}</p>
        <div class="download-link">
          <label>下载地址：</label>
          <input :value="downloadUrl" readonly @click="e => e.target.select()" />
        </div>
        <p class="hint">复制上方链接到浏览器打开下载</p>
        <div class="update-actions">
          <button class="btn primary" @click="updateAvailable = false">我知道了</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, computed, onMounted, inject } from 'vue';
import MinerUConfigDialog from './MinerUConfigDialog.vue';
import AIConfigDialog from './AIConfigDialog.vue';
import ExtensionsDialog from './ExtensionsDialog.vue';
import { usePapersStore } from '../stores/papers.js';
import { useTagsStore, normalizeTagName } from '../stores/tags.js';
import * as store from '../lib/store.js';
defineEmits(['upload', 'pickDir']);

const showHelp = ref(false);
const showMinerUConfig = ref(false);
const showAIConfig = ref(false);
const showExtensions = ref(false);
const showTagManager = ref(false);
const tagSearch = ref('');
const tagDraft = ref('');
const isElectron = ref(false);
const updateAvailable = ref(false);
const currentVersion = ref('2.2.0');
const latestVersion = ref('');
const downloadUrl = ref('');
const changelog = ref('');
const toast = inject('toast');
const papers = usePapersStore();
const tagStore = useTagsStore();
const managedTags = computed(() => {
  const q = tagSearch.value.trim().toLowerCase();
  return [...tagStore.tags]
    .filter((tag) => !q || tag.name.toLowerCase().includes(q))
    .sort((a, b) => {
      const usageDiff = tagUsage(b.name) - tagUsage(a.name);
      if (usageDiff) return usageDiff;
      return a.name.localeCompare(b.name, 'zh-Hans-CN');
    });
});

function tagUsage(name) {
  return tagStore.usageCount(name, papers.papers);
}

function isTagActive(name) {
  return tagStore.activeTagNames.some((tag) => tag.toLowerCase() === name.toLowerCase());
}

function ensureTagStorageReady() {
  if (store.getRoot()) return true;
  toast?.('请先选择数据文件夹', 'error');
  return false;
}

async function addManagedTag() {
  if (!ensureTagStorageReady()) return;
  const name = normalizeTagName(tagDraft.value);
  if (!name) return;
  await tagStore.ensureTags([name]);
  tagDraft.value = '';
  toast?.('标签已添加', 'success');
}

async function deleteManagedTag(name) {
  if (!ensureTagStorageReady()) return;
  const result = await tagStore.deleteLibraryTag(name, papers.papers);
  if (result.ok) {
    toast?.('标签已删除', 'success');
  } else {
    toast?.(`该标签仍被 ${result.count} 篇论文使用，请先从论文中移除`, 'error');
  }
}

function toggleManagedFilter(name) {
  tagStore.toggleFilterTag(name);
}

onMounted(() => {
  // 检测是否为 Electron 环境
  isElectron.value = window.location.protocol === 'file:' || navigator.userAgent.includes('Electron');

  console.log('TopBar mounted, isElectron:', isElectron.value, 'protocol:', window.location.protocol, 'userAgent:', navigator.userAgent);

  // Electron 环境自动检查更新
  if (isElectron.value) {
    checkUpdate(true);
  }
});

function handleCheckUpdate() {
  console.log('点击检查更新按钮');
  checkUpdate(false);
}

async function checkUpdate(silent = false) {
  console.log('开始检查更新, silent:', silent);
  try {
    // Electron 环境使用公网地址，网页版使用相对路径
    const apiUrl = isElectron.value
      ? 'https://aipaper.chat/api/version'
      : '/api/version';

    console.log('检查更新, API:', apiUrl, 'isElectron:', isElectron.value);

    const res = await fetch(apiUrl);
    const data = await res.json();
    latestVersion.value = data.version;
    downloadUrl.value = data.downloadUrl;
    changelog.value = data.changelog;

    console.log('当前版本:', currentVersion.value, '最新版本:', latestVersion.value);

    if (compareVersion(currentVersion.value, latestVersion.value) < 0) {
      updateAvailable.value = true;
    } else if (!silent) {
      if (toast) {
        toast('已是最新版本', 'success');
      } else {
        alert('已是最新版本');
      }
    }
  } catch (e) {
    console.error('检查更新失败:', e);
    if (!silent) {
      if (toast) {
        toast('检查更新失败：' + e.message, 'error');
      } else {
        alert('检查更新失败：' + e.message);
      }
    }
  }
}

function compareVersion(v1, v2) {
  const parts1 = v1.split('.').map(Number);
  const parts2 = v2.split('.').map(Number);
  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const p1 = parts1[i] || 0;
    const p2 = parts2[i] || 0;
    if (p1 < p2) return -1;
    if (p1 > p2) return 1;
  }
  return 0;
}

function goToDownload() {
  window.open('/download.html', '_blank');
}
</script>

<style scoped>
.topbar {
  display: flex; align-items: center; gap: 16px;
  padding: 12px 20px;
  background: var(--panel);
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}
.brand { display: flex; align-items: center; gap: 8px; }
.logo { height: 28px; width: auto; }
.title { font-size: 18px; font-weight: 700; }
.subtitle { font-size: 13px; font-weight: 400; color: var(--muted); }
.topbar .btn { margin-left: 8px; }
.topbar .btn.primary { margin-left: auto; }
.tag-manager-overlay {
  position: fixed; inset: 0; z-index: 1000;
  background: rgba(0, 0, 0, 0.5);
  display: flex; align-items: center; justify-content: center;
  padding: 20px;
}
.tag-manager-modal {
  background: #fff; border-radius: 12px; box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  width: min(620px, 100%); max-height: 82vh;
  display: flex; flex-direction: column;
}
.tag-manager-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 18px 22px; border-bottom: 1px solid var(--border);
}
.tag-manager-header h2 { margin: 0; font-size: 18px; }
.tag-manager-header p { margin-top: 4px; color: var(--muted); font-size: 12px; }
.tag-manager-tools {
  padding: 14px 18px;
  display: grid;
  grid-template-columns: minmax(160px, 1fr) minmax(220px, 1.2fr);
  gap: 10px;
  border-bottom: 1px solid var(--border);
}
.tag-manager-search,
.tag-manager-input {
  width: 100%;
  border: 1px solid var(--border);
  border-radius: 7px;
  padding: 8px 10px;
  outline: none;
  font-size: 13px;
}
.tag-manager-search:focus,
.tag-manager-input:focus { border-color: var(--primary); }
.tag-manager-add {
  display: flex;
  gap: 8px;
}
.tag-manager-list {
  overflow-y: auto;
  padding: 8px 0;
}
.tag-manager-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 10px 18px;
}
.tag-manager-row:hover { background: #f6f7f9; }
.tag-manager-info {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
}
.tag-manager-name {
  font-size: 14px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.tag-manager-count {
  flex-shrink: 0;
  color: var(--muted);
  font-size: 12px;
}
.tag-manager-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}
.danger-lite {
  color: var(--red);
}
.danger-lite:disabled {
  color: var(--muted);
}
.tag-manager-empty {
  padding: 34px 18px;
  text-align: center;
  color: var(--muted);
  font-size: 13px;
}
.help-overlay {
  position: fixed; inset: 0; z-index: 1000;
  background: rgba(0, 0, 0, 0.5);
  display: flex; align-items: center; justify-content: center;
  padding: 20px;
}
.help-modal {
  background: #fff; border-radius: 12px; box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  max-width: 700px; width: 100%; max-height: 85vh;
  display: flex; flex-direction: column;
}
.help-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 20px 24px; border-bottom: 1px solid var(--border);
}
.help-header h2 { margin: 0; font-size: 20px; }
.close-btn {
  border: none; background: transparent; font-size: 24px;
  cursor: pointer; padding: 4px 8px; border-radius: 6px;
  transition: background .15s;
}
.close-btn:hover { background: #f0f1f3; }
.help-content {
  overflow-y: auto; padding: 24px;
  line-height: 1.6;
}
.help-content section {
  margin-bottom: 24px;
}
.help-content section:last-child { margin-bottom: 0; }
.help-content h3 {
  font-size: 16px; margin: 0 0 12px 0;
  color: var(--primary);
}
.help-content p {
  margin: 0 0 8px 0; color: var(--muted); font-size: 14px;
}
.help-content ol, .help-content ul {
  margin: 8px 0; padding-left: 24px;
}
.help-content li {
  margin: 6px 0; font-size: 14px;
}
.help-content code {
  background: #f0f1f3; padding: 2px 6px; border-radius: 4px;
  font-family: "SF Mono", Consolas, monospace; font-size: 13px;
}
.help-content strong { color: var(--text); }
.update-overlay {
  position: fixed; inset: 0; z-index: 1001;
  background: rgba(0, 0, 0, 0.5);
  display: flex; align-items: center; justify-content: center;
  padding: 20px;
}
.update-modal {
  background: #fff; border-radius: 12px; box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  padding: 32px; max-width: 450px; width: 100%;
  text-align: center;
}
.update-modal h3 {
  margin: 0 0 20px 0; font-size: 20px;
}
.update-modal p {
  margin: 8px 0; font-size: 14px; color: var(--text);
}
.update-modal .changelog {
  color: var(--muted); margin: 16px 0;
  padding: 12px; background: #f8f9fa; border-radius: 6px;
}
.download-link {
  margin: 20px 0 8px 0;
  text-align: left;
}
.download-link label {
  display: block; font-size: 13px; font-weight: 600;
  margin-bottom: 6px; color: var(--text);
}
.download-link input {
  width: 100%; padding: 8px 12px; font-size: 13px;
  border: 1px solid var(--border); border-radius: 6px;
  font-family: "SF Mono", Consolas, monospace;
  background: #f8f9fa; cursor: text;
}
.download-link input:focus {
  outline: none; border-color: var(--primary);
}
.update-modal .hint {
  font-size: 12px; color: var(--muted); margin: 4px 0 16px 0;
}
.update-actions {
  display: flex; gap: 12px; justify-content: center; margin-top: 24px;
}
.update-actions .btn {
  padding: 10px 20px; text-decoration: none; display: inline-block;
}
</style>
