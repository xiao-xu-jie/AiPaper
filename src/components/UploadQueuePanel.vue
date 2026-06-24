<template>
  <div class="queue-panel" :class="{ collapsed }">
    <div class="queue-head">
      <button class="queue-toggle" @click="collapsed = !collapsed">{{ collapsed ? '▴' : '▾' }}</button>
      <div class="queue-title">
        <span>解析队列</span>
        <small>{{ summary.done }}/{{ summary.total }} 完成<span v-if="summary.failed">，{{ summary.failed }} 失败</span></small>
      </div>
      <div class="queue-actions">
        <button
          v-if="canPause"
          class="btn small"
          @click="papers.pauseQueue()"
        >暂停</button>
        <button
          v-else-if="canResume"
          class="btn small"
          @click="resume"
        >继续</button>
        <button class="btn small" :disabled="!summary.done" @click="papers.clearFinishedQueue()">清除完成</button>
      </div>
    </div>

    <div v-if="!collapsed" class="queue-list">
      <div v-for="item in papers.uploadQueue" :key="item.id" class="queue-item" :class="item.state">
        <div class="item-main">
          <div class="item-name" :title="item.fileName">{{ item.fileName }}</div>
          <div class="item-state">
            <span>{{ stateLabel(item) }}</span>
            <span v-if="item.error" class="item-error" :title="item.error">{{ item.error }}</span>
          </div>
          <div class="queue-progress">
            <div class="queue-progress-fill" :style="{ width: item.progress + '%' }" />
          </div>
        </div>
        <div class="item-actions">
          <button v-if="item.state === 'failed'" class="link-btn" @click="retry(item.id)">重试</button>
          <button v-if="item.state === 'queued'" class="link-btn danger" @click="papers.cancelQueueItem(item.id)">取消</button>
          <span v-if="item.state === 'done'" class="done-mark">完成</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, inject, ref } from 'vue';
import { useConfigStore } from '../stores/config.js';
import { usePapersStore } from '../stores/papers.js';

const papers = usePapersStore();
const cfg = useConfigStore();
const toast = inject('toast', () => {});
const collapsed = ref(false);

const summary = computed(() => papers.queueSummary);
const canPause = computed(() => papers.queueRunning && !papers.queuePaused);
const canResume = computed(() => papers.queuePaused || (!papers.queueRunning && summary.value.queued > 0));

function stateLabel(item) {
  const map = {
    queued: '等待中',
    running: item.stateText || '处理中',
    done: '已完成',
    failed: '失败',
    canceled: '已取消',
  };
  return map[item.state] || item.stateText || item.state;
}

function ensureToken() {
  if (cfg.token) return true;
  toast('请先配置 MinerU Token', 'error');
  return false;
}

function resume() {
  if (!ensureToken()) return;
  papers.resumeQueue(cfg);
}

function retry(id) {
  if (!ensureToken()) return;
  papers.retryQueueItem(id, cfg);
}
</script>

<style scoped>
.queue-panel {
  position: fixed;
  right: 18px;
  bottom: 46px;
  z-index: 450;
  width: min(460px, calc(100vw - 36px));
  background: #fff;
  border: 1px solid var(--border);
  border-radius: 8px;
  box-shadow: 0 8px 28px rgba(0, 0, 0, .14);
  overflow: hidden;
}
.queue-panel.collapsed {
  width: min(360px, calc(100vw - 36px));
}
.queue-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--border);
  background: #fbfcfd;
}
.queue-panel.collapsed .queue-head {
  border-bottom: none;
}
.queue-toggle {
  border: none;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  font-size: 14px;
  width: 22px;
  height: 22px;
  border-radius: 5px;
}
.queue-toggle:hover { background: #eef0f2; }
.queue-title {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.queue-title span {
  font-weight: 600;
  font-size: 13px;
}
.queue-title small {
  color: var(--muted);
  font-size: 11px;
}
.queue-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}
.queue-list {
  max-height: 320px;
  overflow-y: auto;
}
.queue-item {
  display: flex;
  gap: 10px;
  align-items: center;
  padding: 10px 12px;
  border-bottom: 1px solid var(--border);
}
.queue-item:last-child { border-bottom: none; }
.queue-item.failed { background: #fff7f7; }
.queue-item.done { background: #f8fcf9; }
.item-main {
  flex: 1;
  min-width: 0;
}
.item-name {
  font-size: 13px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.item-state {
  margin-top: 3px;
  display: flex;
  gap: 8px;
  color: var(--muted);
  font-size: 11px;
  min-width: 0;
}
.item-error {
  color: var(--red);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.queue-progress {
  margin-top: 7px;
  height: 5px;
  background: #eceef0;
  border-radius: 999px;
  overflow: hidden;
}
.queue-progress-fill {
  height: 100%;
  background: var(--primary);
  transition: width .25s;
}
.queue-item.failed .queue-progress-fill { background: var(--red); }
.queue-item.done .queue-progress-fill { background: var(--green); }
.item-actions {
  width: 48px;
  display: flex;
  justify-content: flex-end;
  flex-shrink: 0;
}
.link-btn {
  border: none;
  background: transparent;
  color: var(--primary);
  font-size: 12px;
  cursor: pointer;
  padding: 4px 0;
}
.link-btn.danger { color: var(--red); }
.done-mark {
  color: var(--green);
  font-size: 12px;
}
</style>
