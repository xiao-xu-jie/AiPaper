<template>
  <div class="overlay" @click.self="chat.showPicker = false">
    <div class="picker-card">
      <div class="sp-head">
        <div>
          <div class="sp-kicker">AI 助手</div>
          <h2>选择对话</h2>
        </div>
        <button class="sp-close" title="关闭" @click="chat.showPicker = false">✕</button>
      </div>
      <div class="sp-toolbar">
        <p>切换历史会话，或为当前论文开始一个新的提问上下文。</p>
        <button class="sp-new-btn" @click="chat.newSession()">＋ 新建对话</button>
      </div>
      <ul class="sp-list">
        <li v-for="s in chat.sessions" :key="s.id" class="sp-item" @click="chat.selectSession(s)">
          <div class="sp-avatar">AI</div>
          <div class="sp-item-info">
            <div class="sp-item-title">{{ s.title }}</div>
            <div class="sp-item-date">{{ fmtDate(s.updatedAt || s.createdAt) }}</div>
          </div>
          <button class="sp-item-del" title="删除对话" @click.stop="chat.deleteSession(s.id)">✕</button>
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
.overlay {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(15, 23, 42, .42);
  backdrop-filter: blur(4px);
}
.picker-card {
  width: min(460px, 92vw);
  max-height: min(620px, 78vh);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid rgba(226, 232, 240, .95);
  border-radius: 18px;
  background:
    radial-gradient(circle at 18% 0%, rgba(59, 130, 246, .08), transparent 34%),
    #fff;
  box-shadow: 0 24px 70px rgba(15, 23, 42, .24);
}
.sp-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 20px 20px 12px;
}
.sp-kicker {
  margin-bottom: 5px;
  color: #64748b;
  font-size: 11px;
  font-weight: 700;
}
.sp-head h2 {
  margin: 0;
  color: #111827;
  font-size: 18px;
  font-weight: 750;
}
.sp-close {
  width: 34px;
  height: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid #e5e7eb;
  border-radius: 11px;
  background: rgba(255, 255, 255, .72);
  color: #64748b;
  cursor: pointer;
  font-size: 14px;
  transition: background .15s ease, color .15s ease, box-shadow .15s ease;
}
.sp-close:hover {
  background: #fff;
  color: #111827;
  box-shadow: 0 6px 16px rgba(15, 23, 42, .08);
}
.sp-toolbar {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 0 20px 16px;
  border-bottom: 1px solid #edf1f7;
}
.sp-toolbar p {
  flex: 1;
  margin: 0;
  color: #64748b;
  font-size: 12px;
  line-height: 1.45;
}
.sp-new-btn {
  height: 36px;
  flex: 0 0 auto;
  border: none;
  border-radius: 11px;
  padding: 0 14px;
  background: linear-gradient(135deg, #3451d1, #4f6bed);
  color: #fff;
  cursor: pointer;
  font-size: 13px;
  font-weight: 700;
  box-shadow: 0 10px 22px rgba(59, 91, 219, .22);
  transition: transform .15s ease, box-shadow .15s ease, background .15s ease;
}
.sp-new-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 14px 26px rgba(59, 91, 219, .27);
}
.sp-list {
  list-style: none;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px;
}
.sp-item {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 12px;
  border: 1px solid #e6edf7;
  border-radius: 14px;
  background: rgba(255, 255, 255, .76);
  cursor: pointer;
  transition: transform .12s ease, border-color .12s ease, background .12s ease, box-shadow .12s ease;
}
.sp-item:hover {
  transform: translateY(-1px);
  border-color: #cfe0ff;
  background: #fff;
  box-shadow: 0 10px 24px rgba(15, 23, 42, .08);
}
.sp-avatar {
  width: 34px;
  height: 34px;
  flex: 0 0 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  background: #eff6ff;
  color: #2563eb;
  font-size: 11px;
  font-weight: 800;
}
.sp-item-info { flex: 1; min-width: 0; }
.sp-item-title {
  color: #1f2937;
  font-size: 14px;
  font-weight: 650;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.sp-item-date {
  margin-top: 3px;
  color: #8a93a3;
  font-size: 11px;
}
.sp-item-del {
  width: 30px;
  height: 30px;
  flex: 0 0 30px;
  border: none;
  border-radius: 10px;
  background: transparent;
  color: #94a3b8;
  cursor: pointer;
  font-size: 13px;
  transition: background .12s ease, color .12s ease;
}
.sp-item-del:hover {
  color: #dc2626;
  background: #fee2e2;
}
</style>
