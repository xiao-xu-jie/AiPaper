<template>
  <div v-if="visible">
    <!-- 目录行 -->
    <div
      class="folder-row"
      :class="{ active: folders.activeFolderId === nodeId }"
      :style="{ paddingLeft: depth * 14 + 8 + 'px' }"
      @click="toggle"
      @contextmenu.prevent="openCtx($event, nodeId, 'folder')"
    >
      <span class="fold-icon">{{ expanded ? '▾' : '▸' }}</span>
      <span class="folder-icon">📁</span>
      <span class="folder-name">{{ node.name }}</span>
    </div>

    <!-- 子节点 -->
    <template v-if="expanded || searching">
      <FolderNode
        v-for="childId in node.children"
        :key="childId"
        :node-id="childId"
        :depth="depth + 1"
      />

      <!-- 论文列表 -->
      <div
        v-for="p in nodePapers"
        :key="p.id"
        class="paper-item"
        :class="{ active: p.id === papers.currentId }"
        :style="{ paddingLeft: (depth + 1) * 14 + 12 + 'px' }"
        @click="papers.open(p.id)"
        @contextmenu.prevent="openCtx($event, p.id, 'paper')"
      >
        <span class="paper-icon">📄</span>
        <div class="pi-info">
          <div class="pi-title" :title="displayTitle(p)">{{ displayTitle(p) }}</div>
          <div class="pi-sub">
            <span class="badge" :class="badgeClass(p)">{{ badgeLabel(p) }}</span>
            <span class="pi-time">{{ formatUploadTime(p) }}</span>
          </div>
        </div>
      </div>

      <div v-if="!searching && !node.children.length && !nodePapers.length" class="empty-folder" :style="{ paddingLeft: (depth+1)*14 + 12 + 'px' }">空</div>
    </template>
  </div>
</template>

<script setup>
import { computed, inject } from 'vue';

const props = defineProps({ nodeId: String, depth: { type: Number, default: 0 } });

const openCtx = inject('openCtx');
const papers = inject('papers');
const folders = inject('folders');
const paperSearchText = inject('paperSearchText');

const node = computed(() => folders.tree[props.nodeId] || { children: [], papers: [] });
const expanded = computed(() => !!folders.expanded[props.nodeId]);
const searchQuery = computed(() => (paperSearchText?.value || '').trim().toLowerCase());
const searching = computed(() => !!searchQuery.value);

function toggle() {
  folders.activeFolderId = props.nodeId;
  folders.toggle(props.nodeId);
}

function displayTitle(p) {
  return p.remark || p.title || p.fileName || '未命名论文';
}

function uploadTimeValue(p) {
  return p.uploadedAt || p.createdAt || null;
}

function formatUploadTime(p) {
  const ts = uploadTimeValue(p);
  if (!ts) return '上传时间未知';
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${day} ${h}:${min}`;
}

function matchesPaper(p) {
  const q = searchQuery.value;
  if (!q) return true;
  return [
    p.title,
    p.fileName,
    p.remark,
    formatUploadTime(p),
  ].some((v) => String(v || '').toLowerCase().includes(q));
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

const visible = computed(() => !searching.value || props.nodeId === 'root' || folderHasMatch(props.nodeId));

const nodePapers = computed(() => {
  const ids = node.value.papers || [];
  return ids.map((id) => papers.papers.find((p) => p.id === id)).filter(Boolean).filter(matchesPaper);
});

const STATE_MAP = {
  done: ['done', '已完成'], failed: ['failed', '失败'],
  running: ['running', '解析中'], pending: ['running', '排队中'],
  uploading: ['running', '上传中'], converting: ['running', '转换中'],
};
const badgeClass = (p) => (STATE_MAP[p.state] || ['running'])[0];
const badgeLabel = (p) => (p.stateText && p.state !== 'done' ? p.stateText : (STATE_MAP[p.state] || ['', p.state])[1]);
</script>

<style scoped>
.folder-row {
  display: flex; align-items: center; gap: 5px;
  padding: 7px 8px; cursor: pointer; user-select: none; transition: .1s;
  border-bottom: 1px solid transparent;
}
.folder-row:hover { background: #f0f1f3; }
.folder-row.active { background: #eef1ff; }
.fold-icon { font-size: 10px; color: var(--muted); width: 12px; flex-shrink: 0; }
.folder-icon { font-size: 14px; flex-shrink: 0; }
.folder-name { font-size: 13px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.paper-item {
  display: flex; align-items: flex-start; gap: 6px;
  padding: 7px 8px; cursor: pointer; transition: .1s;
  border-bottom: 1px solid var(--border);
}
.paper-item:hover { background: #f0f1f3; }
.paper-item.active { background: #eef1ff; border-left: 3px solid var(--primary); }
.paper-icon { font-size: 13px; flex-shrink: 0; margin-top: 1px; }
.pi-info { flex: 1; min-width: 0; }
.pi-title { font-size: 13px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pi-sub { margin-top: 3px; }
.pi-time { display: inline-block; margin-left: 6px; font-size: 10px; color: var(--muted); }
.badge { font-size: 10px; padding: 1px 6px; border-radius: 8px; }
.badge.done { background: #e6f7ec; color: var(--green); }
.badge.failed { background: #fce8e8; color: var(--red); }
.badge.running { background: #fff2e0; color: var(--orange); }
.empty-folder { font-size: 12px; color: var(--muted); padding: 6px 0; }
</style>
