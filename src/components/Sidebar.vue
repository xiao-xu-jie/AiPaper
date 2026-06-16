<template>
  <aside class="sidebar" :style="{ width: width + 'px' }">
    <div class="sidebar-head">历史论文</div>
    <ul class="paper-list">
      <li v-if="!papers.papers.length" class="empty">暂无论文，上传一个 PDF 开始</li>
      <li
        v-for="p in papers.papers" :key="p.id"
        class="paper-item"
        :class="{ active: p.id === papers.currentId }"
        @click="papers.open(p.id)"
      >
        <div class="pi-title" :title="p.title">{{ p.title }}</div>
        <div class="pi-sub">
          <span class="badge" :class="badgeClass(p)">{{ badgeLabel(p) }}</span>
          <span class="pi-date">{{ fmtDate(p.createdAt) }}</span>
        </div>
        <button class="pi-del" @click.stop="del(p.id)">✕</button>
      </li>
    </ul>
  </aside>
  <div class="resizer" :class="{ dragging }" @mousedown="startDrag" />
</template>

<script setup>
import { ref } from 'vue';
import { usePapersStore } from '../stores/papers.js';

const papers = usePapersStore();
const width = ref(280);
const dragging = ref(false);

function startDrag(e) {
  e.preventDefault();
  const startX = e.clientX, startW = width.value;
  dragging.value = true;
  const onMove = (ev) => { width.value = Math.max(140, startW + (ev.clientX - startX)); };
  const onUp = () => { dragging.value = false; document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}

async function del(id) {
  if (!confirm('确定删除这篇论文及其所有数据？')) return;
  await papers.delete(id);
}

const STATE_MAP = {
  done: ['done', '已完成'], failed: ['failed', '失败'],
  running: ['running', '解析中'], pending: ['running', '排队中'],
  uploading: ['running', '上传中'], converting: ['running', '转换中'],
};
const badgeClass = (p) => (STATE_MAP[p.state] || ['running'])[0];
const badgeLabel = (p) => (p.stateText && p.state !== 'done' ? p.stateText : (STATE_MAP[p.state] || ['', p.state])[1]);

function fmtDate(ts) {
  if (!ts) return '';
  const d = new Date(ts), pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
</script>

<style scoped>
.sidebar {
  background: var(--panel);
  border-right: none;
  display: flex; flex-direction: column;
  overflow: hidden;
  flex-shrink: 0;
  min-width: 140px;
}
.sidebar-head { padding: 14px 16px; font-weight: 600; font-size: 14px; border-bottom: 1px solid var(--border); }
.paper-list { list-style: none; overflow-y: auto; flex: 1; }
.empty { padding: 24px 16px; color: var(--muted); font-size: 13px; text-align: center; }
.paper-item {
  position: relative; padding: 12px 36px 12px 16px;
  border-bottom: 1px solid var(--border); cursor: pointer; transition: .12s;
}
.paper-item:hover { background: #f0f1f3; }
.paper-item.active { background: #eef1ff; border-left: 3px solid var(--primary); padding-left: 13px; }
.pi-title { font-size: 14px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pi-sub { display: flex; align-items: center; gap: 8px; margin-top: 6px; }
.pi-date { font-size: 11px; color: var(--muted); }
.pi-del { position: absolute; top: 10px; right: 10px; border: none; background: transparent; cursor: pointer; color: var(--muted); font-size: 13px; opacity: 0; transition: .12s; }
.paper-item:hover .pi-del { opacity: 1; }
.pi-del:hover { color: var(--red); }
.badge { font-size: 11px; padding: 1px 7px; border-radius: 10px; }
.badge.done { background: #e6f7ec; color: var(--green); }
.badge.failed { background: #fce8e8; color: var(--red); }
.badge.running { background: #fff2e0; color: var(--orange); }
.resizer { width: 5px; flex-shrink: 0; background: var(--border); cursor: col-resize; transition: background .15s; }
.resizer:hover, .resizer.dragging { background: var(--primary); }
</style>
