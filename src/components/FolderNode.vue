<template>
  <div v-if="visible">
    <div
      class="folder-row"
      :class="{ active: folders.activeFolderId === nodeId, 'drop-target': isDropOver, dragging: isDraggingSelf }"
      :style="{ paddingLeft: depth * 14 + 8 + 'px' }"
      :draggable="nodeId !== 'root'"
      @click="toggle"
      @contextmenu.prevent="openCtx($event, nodeId, 'folder')"
      @dragstart="onFolderDragStart($event)"
      @dragend="onDragEnd"
      @dragenter.prevent="onDragEnter($event)"
      @dragover.prevent="onDragOver($event)"
      @dragleave="onDragLeave($event)"
      @drop.prevent="onDrop($event)"
    >
      <span class="fold-icon">{{ expanded ? '▾' : '▸' }}</span>
      <span class="folder-icon">📁</span>
      <span class="folder-name">{{ node.name }}</span>
    </div>

    <template v-if="expanded || filtering">
      <FolderNode
        v-for="childId in node.children"
        :key="childId"
        :node-id="childId"
        :depth="depth + 1"
      />

      <div
        v-for="p in nodePapers"
        :key="p.id"
        class="paper-item"
        :class="{ active: p.id === papers.currentId, dragging: draggingPaperId === p.id }"
        :style="{ paddingLeft: (depth + 1) * 14 + 12 + 'px' }"
        :draggable="true"
        @click="papers.open(p.id)"
        @contextmenu.prevent="openCtx($event, p.id, 'paper')"
        @dragstart="onPaperDragStart($event, p.id)"
        @dragend="onDragEnd"
      >
        <span class="paper-icon">📄</span>
        <div class="pi-info">
          <div class="pi-title" :title="displayTitle(p)">{{ displayTitle(p) }}</div>
          <div class="pi-sub">
            <span class="badge" :class="badgeClass(p)">{{ badgeLabel(p) }}</span>
            <span class="pi-time">{{ formatTime(p) }}</span>
          </div>
          <div v-if="p.tags?.length" class="paper-tags">
            <button
              v-for="tag in visiblePaperTags(p)"
              :key="tag"
              class="paper-tag"
              :class="{ active: isActiveTag(tag), removable: isActiveTag(tag) }"
              :title="isActiveTag(tag) ? '从该论文移除标签' : tag"
              @click.stop="onTagClick(p.id, tag)"
            >
              <span>{{ tag }}</span>
              <span v-if="isActiveTag(tag)" class="tag-x">×</span>
            </button>
            <span v-if="p.tags.length > 3" class="tag-more">+{{ p.tags.length - 3 }}</span>
          </div>
        </div>
      </div>

      <div
        v-if="!filtering && !node.children.length && !nodePapers.length"
        class="empty-folder"
        :style="{ paddingLeft: (depth + 1) * 14 + 12 + 'px' }"
      >
        空
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, inject, ref } from 'vue';

const props = defineProps({ nodeId: String, depth: { type: Number, default: 0 } });

const openCtx = inject('openCtx');
const papers = inject('papers');
const folders = inject('folders');
const tags = inject('tags');
const paperSearchText = inject('paperSearchText');
const paperMatchesFilters = inject('paperMatchesFilters');
const injectedFormatUploadTime = inject('formatUploadTime', null);
const toast = inject('toast', () => {});
const dragState = inject('dragState');

const node = computed(() => folders.tree[props.nodeId] || { children: [], papers: [] });
const expanded = computed(() => !!folders.expanded[props.nodeId]);
const searchQuery = computed(() => (paperSearchText?.value || '').trim().toLowerCase());
const activeTagKeys = computed(() => new Set((tags?.activeTagNames || []).map((tag) => tag.toLowerCase())));
const filtering = computed(() => !!searchQuery.value || activeTagKeys.value.size > 0);

const isDropOver = ref(false);
const draggingPaperId = computed(() => (dragState?.value?.kind === 'paper' ? dragState.value.id : null));
const isDraggingSelf = computed(() => dragState?.value?.kind === 'folder' && dragState.value.id === props.nodeId);

function toggle() {
  folders.activeFolderId = props.nodeId;
  folders.toggle(props.nodeId);
}

function onPaperDragStart(e, paperId) {
  if (dragState) dragState.value = { kind: 'paper', id: paperId };
  e.dataTransfer.effectAllowed = 'move';
  // 必须 setData 才能在某些浏览器中触发 drop 事件
  e.dataTransfer.setData('text/aipaper', `paper:${paperId}`);
}

function onFolderDragStart(e) {
  if (props.nodeId === 'root') { e.preventDefault(); return; }
  if (dragState) dragState.value = { kind: 'folder', id: props.nodeId };
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/aipaper', `folder:${props.nodeId}`);
  e.stopPropagation();
}

function onDragEnd() {
  if (dragState) dragState.value = null;
  isDropOver.value = false;
}

function canAccept(state) {
  if (!state) return false;
  if (state.kind === 'paper') return true;
  if (state.kind === 'folder') {
    if (state.id === props.nodeId) return false;
    if (folders.isAncestor(state.id, props.nodeId)) return false;
    if (folders.getParentFolder(state.id) === props.nodeId) return false;
    return true;
  }
  return false;
}

function onDragEnter(e) {
  if (!canAccept(dragState?.value)) return;
  isDropOver.value = true;
  e.dataTransfer.dropEffect = 'move';
}

function onDragOver(e) {
  if (!canAccept(dragState?.value)) return;
  e.dataTransfer.dropEffect = 'move';
  isDropOver.value = true;
}

function onDragLeave(e) {
  // 仅当鼠标真正离开此 row（不是进入子元素）才清除
  if (!e.currentTarget.contains(e.relatedTarget)) isDropOver.value = false;
}

async function onDrop() {
  const state = dragState?.value;
  isDropOver.value = false;
  if (!canAccept(state)) return;
  if (state.kind === 'paper') {
    await folders.movePaper(state.id, props.nodeId);
    toast(`已移动到「${node.value.name}」`, 'success');
  } else if (state.kind === 'folder') {
    const ok = await folders.moveFolder(state.id, props.nodeId);
    if (ok) toast(`目录已移动到「${node.value.name}」`, 'success');
    else toast('无法移动到目标目录', 'error');
  }
  if (dragState) dragState.value = null;
}

function displayTitle(p) {
  return p.remark || p.title || p.fileName || '未命名论文';
}

function fallbackFormatUploadTime(p) {
  const ts = p.uploadedAt || p.createdAt || null;
  if (!ts) return '上传时间未知';
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${day} ${h}:${min}`;
}

function formatTime(p) {
  return injectedFormatUploadTime ? injectedFormatUploadTime(p) : fallbackFormatUploadTime(p);
}

function matchesPaper(p) {
  return paperMatchesFilters ? paperMatchesFilters(p) : true;
}

function folderHasMatch(folderId) {
  const folder = folders.tree[folderId];
  if (!folder) return false;
  const ownMatch = (folder.papers || [])
    .map((id) => papers.papers.find((p) => p.id === id))
    .filter(Boolean)
    .some(matchesPaper);
  return ownMatch || (folder.children || []).some(folderHasMatch);
}

function isActiveTag(tag) {
  return activeTagKeys.value.has(String(tag).toLowerCase());
}

function visiblePaperTags(p) {
  const list = p.tags || [];
  if (!activeTagKeys.value.size) return list.slice(0, 3);
  const active = list.filter(isActiveTag);
  const rest = list.filter((tag) => !isActiveTag(tag));
  return [...active, ...rest].slice(0, 3);
}

async function onTagClick(paperId, tag) {
  if (isActiveTag(tag)) await papers.removeTagFromPaper(paperId, tag);
  else tags.toggleFilterTag(tag);
}

const visible = computed(() => !filtering.value || props.nodeId === 'root' || folderHasMatch(props.nodeId));

const nodePapers = computed(() => {
  const ids = node.value.papers || [];
  return ids.map((id) => papers.papers.find((p) => p.id === id)).filter(Boolean).filter(matchesPaper);
});

const STATE_MAP = {
  done: ['done', '已完成'],
  failed: ['failed', '失败'],
  running: ['running', '解析中'],
  pending: ['running', '排队中'],
  uploading: ['running', '上传中'],
  converting: ['running', '转换中'],
};
const badgeClass = (p) => (STATE_MAP[p.state] || ['running'])[0];
const badgeLabel = (p) => (p.stateText && p.state !== 'done' ? p.stateText : (STATE_MAP[p.state] || ['', p.state])[1]);
</script>

<style scoped>
.folder-row {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 7px 8px;
  cursor: pointer;
  user-select: none;
  transition: .1s;
  border-bottom: 1px solid transparent;
}
.folder-row:hover { background: #f0f1f3; }
.folder-row.active { background: #eef1ff; }
.folder-row.drop-target {
  background: #e0e7ff;
  outline: 2px dashed var(--primary);
  outline-offset: -2px;
}
.folder-row.dragging,
.paper-item.dragging {
  opacity: 0.4;
}
.fold-icon {
  font-size: 10px;
  color: var(--muted);
  width: 12px;
  flex-shrink: 0;
}
.folder-icon {
  font-size: 14px;
  flex-shrink: 0;
}
.folder-name {
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.paper-item {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  padding: 7px 8px;
  cursor: pointer;
  transition: .1s;
  border-bottom: 1px solid var(--border);
}
.paper-item:hover { background: #f0f1f3; }
.paper-item.active {
  background: #eef1ff;
  border-left: 3px solid var(--primary);
}
.paper-icon {
  font-size: 13px;
  flex-shrink: 0;
  margin-top: 1px;
}
.pi-info {
  flex: 1;
  min-width: 0;
}
.pi-title {
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.pi-sub {
  margin-top: 3px;
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
.pi-time {
  font-size: 10px;
  color: var(--muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.badge {
  flex-shrink: 0;
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 8px;
}
.badge.done { background: #e6f7ec; color: var(--green); }
.badge.failed { background: #fce8e8; color: var(--red); }
.badge.running { background: #fff2e0; color: var(--orange); }
.paper-tags {
  margin-top: 5px;
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.paper-tag {
  border: 1px solid var(--border);
  background: #f7f8fa;
  color: var(--muted);
  border-radius: 5px;
  padding: 1px 5px;
  max-width: 100%;
  font-size: 10px;
  line-height: 1.45;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 3px;
}
.paper-tag:hover {
  color: var(--primary);
  border-color: #bcc5ff;
}
.paper-tag.active {
  color: var(--primary);
  background: #eef1ff;
  border-color: #9aa8ff;
}
.paper-tag.removable:hover {
  color: var(--red);
  border-color: #f0b5b5;
  background: #fff2f2;
}
.tag-x {
  color: inherit;
  font-size: 11px;
}
.tag-more {
  font-size: 10px;
  color: var(--muted);
  line-height: 1.7;
}
.empty-folder {
  font-size: 12px;
  color: var(--muted);
  padding: 6px 0;
}
</style>
