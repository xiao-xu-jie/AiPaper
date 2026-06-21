<template>
  <aside class="sidebar" :style="{ width: width + 'px' }">
    <div class="sidebar-head">
      <span>论文库</span>
      <button class="btn-icon" title="新建目录" @click="createFolder('root')">+</button>
    </div>

    <div class="search-wrap">
      <input
        v-model="searchText"
        class="paper-search"
        placeholder="搜索题目、备注、上传时间或标签"
        spellcheck="false"
      />

      <div v-if="tagStore.tags.length" class="tag-filter">
        <div class="tag-filter-head">
          <span>标签</span>
          <div class="tag-head-actions">
            <button v-if="canToggleTagPanel" class="link-btn" @click="tagPanelExpanded = !tagPanelExpanded">
              {{ tagPanelExpanded ? '收起' : `展开 ${hiddenTagCount}` }}
            </button>
            <button v-if="tagStore.activeTagNames.length" class="link-btn" @click="tagStore.clearFilters()">清空</button>
          </div>
        </div>
        <div class="tag-chip-list library-filter-tags" :class="{ expanded: tagPanelExpanded }">
          <button
            v-for="tag in visibleLibraryTags"
            :key="tag.id"
            class="tag-chip"
            :class="{ active: isTagActive(tag.name) }"
            :title="`使用 ${tagUsage(tag.name)} 篇`"
            @click="tagStore.toggleFilterTag(tag.name)"
          >
            <span>{{ tag.name }}</span>
            <span class="tag-count">{{ tagUsage(tag.name) }}</span>
            <span
              class="tag-delete"
              title="删除标签"
              @click.stop="deleteLibraryTag(tag.name)"
            >×</span>
          </button>
        </div>
        <button
          v-if="tagStore.activeTagNames.length && filteredPaperIds.length"
          class="batch-tag-btn"
          @click="removeActiveTagsFromResults"
        >
          从当前结果移除筛选标签
        </button>
      </div>
    </div>

    <div class="tree-wrap">
      <FolderNode node-id="root" :depth="0" />
    </div>
  </aside>
  <div class="resizer" :class="{ dragging }" @mousedown="startDrag" />

  <Teleport to="body">
    <div v-if="renameTarget || createTarget" class="folder-dialog-backdrop" @click="cancelDialog">
      <div class="folder-dialog" @click.stop>
        <div class="fd-title">{{ createTarget ? '新建目录' : '重命名目录' }}</div>
        <input
          ref="renameInput"
          v-model="renameDraft"
          class="fd-input"
          placeholder="目录名称"
          @keydown.enter="commitDialog"
          @keydown.esc="cancelDialog"
        />
        <div class="fd-actions">
          <button class="btn small" @click="cancelDialog">取消</button>
          <button class="btn small primary" @click="commitDialog">确认</button>
        </div>
      </div>
    </div>
  </Teleport>

  <Teleport to="body">
    <div v-if="remarkTarget" class="folder-dialog-backdrop" @click="cancelRemark">
      <div class="folder-dialog" @click.stop>
        <div class="fd-title">论文备注</div>
        <div class="fd-hint">{{ currentRemarkPaper?.title }}</div>
        <input
          ref="remarkInput"
          v-model="remarkDraft"
          class="fd-input"
          placeholder="输入备注，留空则显示原题名"
          @keydown.enter="commitRemark"
          @keydown.esc="cancelRemark"
        />
        <div class="fd-actions">
          <button class="btn small" @click="cancelRemark">取消</button>
          <button v-if="currentRemarkPaper?.remark" class="btn small" @click="clearRemark">删除备注</button>
          <button class="btn small primary" @click="commitRemark">确认</button>
        </div>
      </div>
    </div>
  </Teleport>

  <Teleport to="body">
    <div v-if="tagTarget" class="folder-dialog-backdrop" @click="cancelTagDialog">
      <div class="folder-dialog tag-dialog" @click.stop>
        <div class="fd-title">论文标签</div>
        <div class="fd-hint">{{ currentTagPaper?.title }}</div>

        <div class="selected-tags">
          <button
            v-for="tag in tagDraftTags"
            :key="tag"
            class="tag-chip active removable"
            @click="removeDraftTag(tag)"
          >
            {{ tag }} <span>×</span>
          </button>
          <span v-if="!tagDraftTags.length" class="empty-tags">暂无标签</span>
        </div>

        <div class="tag-input-row">
          <input
            ref="tagInput"
            v-model="tagDraft"
            class="fd-input"
            placeholder="添加标签"
            @keydown.enter.prevent="addDraftTag"
            @keydown.esc="cancelTagDialog"
          />
          <button class="btn small" @click="addDraftTag">添加</button>
        </div>

        <div v-if="tagStore.tags.length" class="library-tags">
          <button
            v-for="tag in tagStore.tags"
            :key="tag.id"
            class="tag-chip"
            :class="{ active: draftHasTag(tag.name) }"
            @click="toggleDraftTag(tag.name)"
          >
            {{ tag.name }}
          </button>
        </div>

        <div class="fd-actions">
          <button class="btn small" @click="cancelTagDialog">取消</button>
          <button class="btn small primary" @click="commitTags">保存</button>
        </div>
      </div>
    </div>
  </Teleport>

  <Teleport to="body">
    <div v-if="aiTagPanel.show" class="folder-dialog-backdrop" @click="closeAiTagPanel">
      <div class="folder-dialog ai-tag-dialog" @click.stop>
        <div class="fd-title">AI 生成标签</div>
        <div class="fd-hint">{{ aiTagPaper?.title }}</div>

        <div v-if="aiTagPanel.loading" class="ai-tag-loading">
          <span class="ai-spinner" />
          <span>正在分析论文内容...</span>
        </div>

        <div v-else-if="aiTagPanel.error" class="ai-tag-error">
          {{ aiTagPanel.error }}
        </div>

        <template v-else>
          <div v-if="aiTagPaper?.tags?.length" class="ai-tag-section">
            <div class="section-label">当前标签</div>
            <div class="tag-chip-list">
              <span v-for="tag in aiTagPaper.tags" :key="tag" class="tag-chip readonly">{{ tag }}</span>
            </div>
          </div>

          <div class="ai-tag-section">
            <div class="section-label">建议标签</div>
            <div class="tag-chip-list">
              <button
                v-for="tag in aiTagPanel.tags"
                :key="tag"
                class="tag-chip"
                :class="{ active: aiTagSelected(tag) }"
                @click="toggleAiTag(tag)"
              >
                {{ tag }}
              </button>
              <span v-if="!aiTagPanel.tags.length" class="empty-tags">暂无建议标签</span>
            </div>
          </div>

          <div class="tag-input-row">
            <input
              v-model="aiTagDraft"
              class="fd-input"
              placeholder="补充标签"
              @keydown.enter.prevent="addAiDraftTag"
              @keydown.esc="closeAiTagPanel"
            />
            <button class="btn small" @click="addAiDraftTag">添加</button>
          </div>
        </template>

        <div class="fd-actions">
          <button class="btn small" @click="closeAiTagPanel">取消</button>
          <button class="btn small" :disabled="aiTagPanel.loading" @click="regenerateAiTags">重新生成</button>
          <button
            class="btn small primary"
            :disabled="aiTagPanel.loading || !aiTagPanel.selected.length"
            @click="commitAiTags"
          >
            保存选中标签
          </button>
        </div>
      </div>
    </div>
  </Teleport>

  <Teleport to="body">
    <div v-if="confirmDialog.show" class="folder-dialog-backdrop" @click="confirmDialog.show = false">
      <div class="folder-dialog" @click.stop>
        <div class="fd-title">{{ confirmDialog.msg }}</div>
        <div class="fd-actions">
          <button class="btn small" @click="confirmDialog.show = false">取消</button>
          <button class="btn small primary danger-btn" @click="confirmDialog.onOk(); confirmDialog.show = false">确认</button>
        </div>
      </div>
    </div>
  </Teleport>

  <Teleport to="body">
    <div v-if="ctx.show" class="ctx-menu" :style="{ left: ctx.x + 'px', top: ctx.y + 'px' }" @click.stop>
      <button v-if="ctx.type === 'folder'" @click="createFolder(ctx.id)">新建子目录</button>
      <button v-if="ctx.type === 'folder' && ctx.id !== 'root'" @click="startRename(ctx.id)">重命名</button>
      <button v-if="ctx.type === 'folder' && ctx.id !== 'root'" class="danger" @click="delFolder(ctx.id)">删除目录</button>
      <template v-if="ctx.type === 'paper'">
        <button @click="startRemark(ctx.id)">{{ paperById(ctx.id)?.remark ? '编辑备注' : '添加备注' }}</button>
        <button v-if="paperById(ctx.id)?.remark" @click="removeRemark(ctx.id)">删除备注</button>
        <button @click="startTagDialog(ctx.id)">编辑标签</button>
        <button :disabled="aiTagging" @click="generateTags(ctx.id)">AI 生成标签</button>
        <button @click="showMoveMenu = true">移动到目录</button>
        <button class="danger" @click="delPaper(ctx.id)">删除论文</button>
      </template>
    </div>
    <div v-if="ctx.show" class="ctx-backdrop" @click="ctx.show = false" @contextmenu.prevent="ctx.show = false" />

    <div v-if="ctx.show && showMoveMenu" class="ctx-menu move-menu" :style="{ left: ctx.x + 132 + 'px', top: ctx.y + 'px' }">
      <button v-for="f in allFolders" :key="f.id" @click="movePaper(ctx.id, f.id)">{{ f.name }}</button>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, computed, nextTick, provide, inject } from 'vue';
import { usePapersStore } from '../stores/papers.js';
import { useFoldersStore } from '../stores/folders.js';
import { useTagsStore, normalizeTagNames, normalizeTagName } from '../stores/tags.js';
import { useConfigStore } from '../stores/config.js';
import FolderNode from './FolderNode.vue';
import * as store from '../lib/store.js';
import * as agent from '../lib/agent.js';

const papers = usePapersStore();
const folders = useFoldersStore();
const tagStore = useTagsStore();
const cfg = useConfigStore();
const toast = inject('toast', () => {});

const width = ref(280);
const dragging = ref(false);
const searchText = ref('');
const tagPanelExpanded = ref(false);
const ctx = ref({ show: false, x: 0, y: 0, id: '', type: '' });
const showMoveMenu = ref(false);
const confirmDialog = ref({ show: false, msg: '', onOk: () => {} });
const renameTarget = ref(null);
const createTarget = ref(null);
const renameDraft = ref('');
const renameInput = ref(null);
const remarkTarget = ref(null);
const remarkDraft = ref('');
const remarkInput = ref(null);
const tagTarget = ref(null);
const tagDraft = ref('');
const tagDraftTags = ref([]);
const tagInput = ref(null);
const aiTagging = ref(false);
const aiTagDraft = ref('');
const aiTagPanel = ref({
  show: false,
  paperId: '',
  loading: false,
  error: '',
  tags: [],
  selected: [],
});

const allFolders = computed(() => Object.values(folders.tree));
const currentRemarkPaper = computed(() => paperById(remarkTarget.value));
const currentTagPaper = computed(() => paperById(tagTarget.value));
const aiTagPaper = computed(() => paperById(aiTagPanel.value.paperId));
const searchQuery = computed(() => searchText.value.trim().toLowerCase());
const activeTagKeys = computed(() => new Set(tagStore.activeTagNames.map((tag) => tag.toLowerCase())));
const filteredPaperIds = computed(() => papers.papers.filter(matchesPaperFilters).map((paper) => paper.id));
const orderedLibraryTags = computed(() => {
  return [...tagStore.tags].sort((a, b) => {
    const aActive = isTagActive(a.name) ? 1 : 0;
    const bActive = isTagActive(b.name) ? 1 : 0;
    if (aActive !== bActive) return bActive - aActive;
    const usageDiff = tagUsage(b.name) - tagUsage(a.name);
    if (usageDiff) return usageDiff;
    return a.name.localeCompare(b.name, 'zh-Hans-CN');
  });
});
const canToggleTagPanel = computed(() => orderedLibraryTags.value.length > 12);
const visibleLibraryTags = computed(() => (tagPanelExpanded.value ? orderedLibraryTags.value : orderedLibraryTags.value.slice(0, 12)));
const hiddenTagCount = computed(() => Math.max(0, orderedLibraryTags.value.length - visibleLibraryTags.value.length));

function paperById(id) {
  return papers.papers.find((p) => p.id === id) || null;
}

function showConfirm(msg, onOk) {
  confirmDialog.value = { show: true, msg, onOk };
}

function startDrag(e) {
  e.preventDefault();
  const startX = e.clientX;
  const startW = width.value;
  dragging.value = true;
  const onMove = (ev) => { width.value = Math.max(180, startW + (ev.clientX - startX)); };
  const onUp = () => {
    dragging.value = false;
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
  };
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}

function openCtx(e, id, type) {
  ctx.value = { show: true, x: e.clientX, y: e.clientY, id, type };
  showMoveMenu.value = false;
}

function formatUploadTime(p) {
  const ts = p?.uploadedAt || p?.createdAt || null;
  if (!ts) return '上传时间未知';
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${day} ${h}:${min}`;
}

function matchesSearch(p) {
  const q = searchQuery.value;
  if (!q) return true;
  return [
    p.title,
    p.fileName,
    p.remark,
    formatUploadTime(p),
    ...(p.tags || []),
  ].some((v) => String(v || '').toLowerCase().includes(q));
}

function matchesActiveTags(p) {
  if (!activeTagKeys.value.size) return true;
  return (p.tags || []).some((tag) => activeTagKeys.value.has(String(tag).toLowerCase()));
}

function matchesPaperFilters(p) {
  return matchesSearch(p) && matchesActiveTags(p);
}

function isTagActive(name) {
  return activeTagKeys.value.has(name.toLowerCase());
}

function tagUsage(name) {
  return tagStore.usageCount(name, papers.papers);
}

async function deleteLibraryTag(name) {
  const result = await tagStore.deleteLibraryTag(name, papers.papers);
  if (result.ok) {
    toast('标签已删除', 'success');
  } else {
    toast(`该标签仍被 ${result.count} 篇论文使用，请先从论文中移除`, 'error');
  }
}

async function removeActiveTagsFromResults() {
  const names = [...tagStore.activeTagNames];
  const ids = [...filteredPaperIds.value];
  if (!names.length || !ids.length) return;
  showConfirm(`从当前 ${ids.length} 篇结果中移除标签「${names.join('、')}」？`, async () => {
    const changed = await papers.removeTagsFromPapers(ids, names);
    toast(`已更新 ${changed} 篇论文`, 'success');
  });
}

function cancelDialog() {
  renameTarget.value = null;
  createTarget.value = null;
}

async function commitDialog() {
  const name = renameDraft.value.trim();
  if (!name) return;
  if (createTarget.value) {
    const id = await folders.createFolder(createTarget.value, name);
    folders.activeFolderId = id;
  } else if (renameTarget.value) {
    await folders.renameFolder(renameTarget.value, name);
  }
  cancelDialog();
}

function createFolder(parentId) {
  ctx.value.show = false;
  renameDraft.value = '';
  createTarget.value = parentId;
  nextTick(() => renameInput.value?.focus());
}

function startRename(id) {
  ctx.value.show = false;
  renameDraft.value = folders.tree[id]?.name || '';
  renameTarget.value = id;
  nextTick(() => renameInput.value?.focus());
}

async function delFolder(id) {
  ctx.value.show = false;
  showConfirm(`删除目录「${folders.tree[id]?.name}」？论文将移回根目录`, async () => {
    await folders.deleteFolder(id);
  });
}

async function delPaper(id) {
  ctx.value.show = false;
  showConfirm('确定删除这篇论文及其所有数据？', async () => {
    await papers.delete(id);
  });
}

async function movePaper(paperId, folderId) {
  ctx.value.show = false;
  showMoveMenu.value = false;
  await folders.movePaper(paperId, folderId);
}

function cancelRemark() {
  remarkTarget.value = null;
  remarkDraft.value = '';
}

function startRemark(id) {
  ctx.value.show = false;
  const paper = paperById(id);
  remarkTarget.value = id;
  remarkDraft.value = paper?.remark || '';
  nextTick(() => remarkInput.value?.focus());
}

async function commitRemark() {
  if (!remarkTarget.value) return;
  await papers.updateRemark(remarkTarget.value, remarkDraft.value);
  cancelRemark();
}

async function clearRemark() {
  if (!remarkTarget.value) return;
  await papers.updateRemark(remarkTarget.value, '');
  cancelRemark();
}

async function removeRemark(id) {
  ctx.value.show = false;
  await papers.updateRemark(id, '');
}

function startTagDialog(id) {
  ctx.value.show = false;
  const paper = paperById(id);
  tagTarget.value = id;
  tagDraftTags.value = normalizeTagNames(paper?.tags || []);
  tagDraft.value = '';
  nextTick(() => tagInput.value?.focus());
}

function cancelTagDialog() {
  tagTarget.value = null;
  tagDraft.value = '';
  tagDraftTags.value = [];
}

function draftHasTag(name) {
  const key = normalizeTagName(name).toLowerCase();
  return tagDraftTags.value.some((tag) => tag.toLowerCase() === key);
}

function addDraftTag() {
  const name = normalizeTagName(tagDraft.value);
  if (!name) return;
  if (!draftHasTag(name)) tagDraftTags.value = normalizeTagNames([...tagDraftTags.value, name]);
  tagDraft.value = '';
}

function removeDraftTag(name) {
  const key = normalizeTagName(name).toLowerCase();
  tagDraftTags.value = tagDraftTags.value.filter((tag) => tag.toLowerCase() !== key);
}

function toggleDraftTag(name) {
  if (draftHasTag(name)) removeDraftTag(name);
  else tagDraftTags.value = normalizeTagNames([...tagDraftTags.value, name]);
}

async function commitTags() {
  if (!tagTarget.value) return;
  await papers.updateTags(tagTarget.value, tagDraftTags.value);
  cancelTagDialog();
  toast('标签已保存', 'success');
}

function parseAiTags(text) {
  const raw = String(text || '').trim();
  const jsonText = raw.match(/\[[\s\S]*\]/)?.[0];
  if (jsonText) {
    try {
      const parsed = JSON.parse(jsonText);
      if (Array.isArray(parsed)) return normalizeTagNames(parsed);
    } catch { /* fallback */ }
  }
  return normalizeTagNames(
    raw
      .split(/[\n,，、;；]/)
      .map((item) => item.replace(/^[-*\d.\s"'\[\]]+/, '').replace(/["'\[\]]+$/, '')),
  );
}

async function generateTags(id) {
  const paper = paperById(id);
  if (!paper || aiTagging.value) return;
  ctx.value.show = false;
  aiTagPanel.value = {
    show: true,
    paperId: id,
    loading: true,
    error: '',
    tags: [],
    selected: [],
  };
  aiTagDraft.value = '';
  if (paper.state !== 'done') {
    aiTagPanel.value.loading = false;
    aiTagPanel.value.error = '请先等待论文解析完成';
    return;
  }
  if (!cfg.aiUrl || !cfg.aiModel) {
    aiTagPanel.value.loading = false;
    aiTagPanel.value.error = '请先配置 AI 接口地址和模型';
    return;
  }
  aiTagging.value = true;
  try {
    const md = await store.loadMarkdown(id);
    const libraryTags = [...tagStore.tags]
      .sort((a, b) => {
        const usageDiff = tagUsage(b.name) - tagUsage(a.name);
        if (usageDiff) return usageDiff;
        return a.name.localeCompare(b.name, 'zh-Hans-CN');
      })
      .map((tag) => tag.name)
      .slice(0, 80);
    const prompt = [
      '请根据下面论文内容生成 3-6 个短标签。',
      '要求：只返回 JSON 字符串数组；每个标签不超过 16 个字；优先使用中文学术标签；不要解释。',
      '请优先从“现有标签库”中选择语义匹配的标签，避免生成同义、近义或只是措辞不同的新标签；只有标签库没有合适标签时，才生成新标签。',
      `论文题目：${paper.title || paper.fileName || ''}`,
      `当前论文已有标签：${(paper.tags || []).join('、') || '无'}`,
      `现有标签库：${libraryTags.join('、') || '无'}`,
      '论文内容：',
      String(md || '').slice(0, 12000),
    ].join('\n');
    const reply = await agent.chat([], prompt, [], () => {});
    const generated = parseAiTags(reply);
    if (!generated.length) {
      aiTagPanel.value.error = 'AI 未返回有效标签';
      return;
    }
    aiTagPanel.value.tags = generated;
    aiTagPanel.value.selected = generated;
  } catch (e) {
    aiTagPanel.value.error = '生成标签失败：' + e.message;
  } finally {
    aiTagPanel.value.loading = false;
    aiTagging.value = false;
  }
}

function closeAiTagPanel() {
  if (aiTagPanel.value.loading) return;
  aiTagPanel.value.show = false;
  aiTagDraft.value = '';
}

function aiTagSelected(tag) {
  const key = normalizeTagName(tag).toLowerCase();
  return aiTagPanel.value.selected.some((item) => item.toLowerCase() === key);
}

function toggleAiTag(tag) {
  const name = normalizeTagName(tag);
  const key = name.toLowerCase();
  if (!name) return;
  if (aiTagSelected(name)) {
    aiTagPanel.value.selected = aiTagPanel.value.selected.filter((item) => item.toLowerCase() !== key);
  } else {
    aiTagPanel.value.selected = normalizeTagNames([...aiTagPanel.value.selected, name]);
  }
}

function addAiDraftTag() {
  const name = normalizeTagName(aiTagDraft.value);
  if (!name) return;
  aiTagPanel.value.tags = normalizeTagNames([...aiTagPanel.value.tags, name], 64);
  aiTagPanel.value.selected = normalizeTagNames([...aiTagPanel.value.selected, name], 64);
  aiTagDraft.value = '';
}

async function regenerateAiTags() {
  const id = aiTagPanel.value.paperId;
  if (!id || aiTagPanel.value.loading) return;
  await generateTags(id);
}

async function commitAiTags() {
  const paper = aiTagPaper.value;
  if (!paper) return;
  const merged = normalizeTagNames([...(paper.tags || []), ...aiTagPanel.value.selected]);
  await papers.updateTags(paper.id, merged);
  closeAiTagPanel();
  toast('AI 标签已保存', 'success');
}

provide('openCtx', openCtx);
provide('papers', papers);
provide('folders', folders);
provide('tags', tagStore);
provide('paperSearchText', searchText);
provide('paperMatchesFilters', matchesPaperFilters);
provide('formatUploadTime', formatUploadTime);
</script>

<style scoped>
.sidebar {
  background: var(--panel);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  flex-shrink: 0;
  min-width: 180px;
}
.sidebar-head {
  padding: 12px 16px;
  font-weight: 600;
  font-size: 14px;
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.search-wrap {
  padding: 10px 12px;
  border-bottom: 1px solid var(--border);
}
.paper-search {
  width: 100%;
  border: 1px solid var(--border);
  border-radius: 7px;
  padding: 7px 9px;
  outline: none;
  font-size: 13px;
}
.paper-search:focus { border-color: var(--primary); }
.btn-icon {
  width: 24px;
  height: 24px;
  border: 1px solid transparent;
  background: transparent;
  cursor: pointer;
  font-size: 18px;
  color: var(--muted);
  border-radius: 6px;
  line-height: 1;
}
.btn-icon:hover {
  color: var(--primary);
  border-color: var(--border);
  background: #f6f7f9;
}
.tag-filter {
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 7px;
}
.tag-filter-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--muted);
}
.tag-head-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}
.link-btn {
  border: none;
  background: transparent;
  color: var(--primary);
  font-size: 12px;
  cursor: pointer;
  padding: 0;
}
.tag-chip-list,
.selected-tags,
.library-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.library-filter-tags {
  max-height: 108px;
  overflow: hidden;
}
.library-filter-tags.expanded {
  max-height: none;
  overflow-y: auto;
  padding-right: 2px;
}
.tag-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  max-width: 100%;
  border: 1px solid var(--border);
  background: #f7f8fa;
  color: var(--text);
  border-radius: 6px;
  padding: 3px 7px;
  font-size: 11px;
  line-height: 1.35;
  cursor: pointer;
}
.tag-chip.active {
  border-color: #9aa8ff;
  background: #eef1ff;
  color: var(--primary);
}
.tag-chip.removable span,
.tag-delete {
  color: var(--muted);
  font-size: 12px;
}
.tag-delete:hover { color: var(--red); }
.tag-count {
  color: var(--muted);
  font-size: 10px;
}
.batch-tag-btn {
  border: 1px solid var(--border);
  background: #fff;
  color: var(--primary);
  border-radius: 7px;
  padding: 6px 8px;
  font-size: 12px;
  cursor: pointer;
}
.batch-tag-btn:hover {
  border-color: var(--primary);
  background: #f7f8ff;
}
.tree-wrap { flex: 1; overflow-y: auto; }
.resizer {
  width: 5px;
  flex-shrink: 0;
  background: var(--border);
  cursor: col-resize;
  transition: background .15s;
}
.resizer:hover,
.resizer.dragging { background: var(--primary); }
.ctx-menu {
  position: fixed;
  z-index: 500;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0,0,0,.12);
  overflow: hidden;
  min-width: 132px;
}
.ctx-menu button {
  display: block;
  width: 100%;
  padding: 9px 14px;
  border: none;
  background: transparent;
  text-align: left;
  cursor: pointer;
  font-size: 13px;
  color: var(--text);
}
.ctx-menu button:hover { background: #f0f1f3; }
.ctx-menu button:disabled { color: var(--muted); cursor: default; }
.ctx-menu button.danger:hover { background: #fce8e8; color: var(--red); }
.ctx-backdrop {
  position: fixed;
  inset: 0;
  z-index: 499;
}
.move-menu { min-width: 150px; }
.folder-dialog-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 600;
}
.folder-dialog {
  background: #fff;
  border-radius: 10px;
  padding: 20px;
  width: 320px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.tag-dialog { width: 380px; }
.ai-tag-dialog { width: 420px; }
.fd-title {
  font-weight: 600;
  font-size: 15px;
}
.fd-hint {
  font-size: 12px;
  color: var(--muted);
  line-height: 1.4;
  max-height: 44px;
  overflow: hidden;
}
.fd-input {
  border: 1px solid var(--border);
  border-radius: 7px;
  padding: 8px 12px;
  font-size: 14px;
  outline: none;
}
.fd-input:focus { border-color: var(--primary); }
.tag-input-row {
  display: flex;
  gap: 8px;
}
.tag-input-row .fd-input {
  flex: 1;
  min-width: 0;
}
.library-tags {
  max-height: 110px;
  overflow-y: auto;
  padding-top: 2px;
}
.tag-chip.readonly {
  cursor: default;
  background: #fff;
}
.ai-tag-section {
  display: flex;
  flex-direction: column;
  gap: 7px;
}
.section-label {
  font-size: 12px;
  color: var(--muted);
}
.ai-tag-loading {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 74px;
  color: var(--muted);
  font-size: 13px;
}
.ai-spinner {
  width: 18px;
  height: 18px;
  border: 2px solid #d9ddea;
  border-top-color: var(--primary);
  border-radius: 50%;
  animation: aiSpin .8s linear infinite;
}
.ai-tag-error {
  border: 1px solid #f3c1c1;
  background: #fff2f2;
  color: var(--red);
  border-radius: 7px;
  padding: 10px 12px;
  font-size: 13px;
}
@keyframes aiSpin {
  to { transform: rotate(360deg); }
}
.empty-tags {
  color: var(--muted);
  font-size: 12px;
}
.fd-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}
.danger-btn {
  background: var(--red) !important;
  border-color: var(--red) !important;
}
</style>
