<template>
  <div class="overlay" @click.self="chat.showPicker = false">
    <div class="picker-card">
      <div class="sp-head">
        <span>选择对话</span>
        <button class="btn small" @click="chat.showPicker = false">✕</button>
      </div>
      <button class="btn primary sp-new-btn" @click="chat.newSession()">＋ 新建对话</button>
      <ul class="sp-list">
        <li v-for="s in chat.sessions" :key="s.id" class="sp-item" @click="chat.selectSession(s)">
          <div class="sp-item-info">
            <div class="sp-item-title">{{ s.title }}</div>
            <div class="sp-item-date">{{ fmtDate(s.updatedAt || s.createdAt) }}</div>
          </div>
          <button class="sp-item-del" @click.stop="chat.deleteSession(s.id)">✕</button>
        </li>
      </ul>
    </div>
  </div>
</template>

<script setup>
import { useChatStore } from '../stores/chat.js';
const chat = useChatStore();

function fmtDate(ts) {
  if (!ts) return '';
  const d = new Date(ts), p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
</script>

<style scoped>
.overlay { position: fixed; inset: 0; background: rgba(0,0,0,.5); display: flex; align-items: center; justify-content: center; z-index: 100; }
.picker-card { background: #fff; border-radius: 12px; padding: 20px; width: 420px; max-height: 70vh; display: flex; flex-direction: column; gap: 12px; box-shadow: 0 8px 32px rgba(0,0,0,.15); }
.sp-head { display: flex; align-items: center; justify-content: space-between; font-weight: 600; font-size: 15px; }
.sp-new-btn { align-self: flex-start; }
.sp-list { list-style: none; overflow-y: auto; display: flex; flex-direction: column; gap: 6px; }
.sp-item { display: flex; align-items: center; gap: 8px; padding: 10px 12px; border: 1px solid var(--border); border-radius: 8px; cursor: pointer; transition: .12s; }
.sp-item:hover { background: #f0f1f3; }
.sp-item-info { flex: 1; min-width: 0; }
.sp-item-title { font-size: 14px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sp-item-date { font-size: 11px; color: var(--muted); }
.sp-item-del { border: none; background: transparent; color: var(--muted); cursor: pointer; font-size: 13px; padding: 2px 6px; border-radius: 4px; }
.sp-item-del:hover { color: var(--red); background: #fce8e8; }
</style>
