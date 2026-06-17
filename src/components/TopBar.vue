<template>
  <header class="topbar">
    <div class="brand">
      <img src="/assets/logo.png" alt="AI Paper" class="logo" />
      <span class="title">AI Paper</span>
      <span class="subtitle">MinerU 在线解析</span>
    </div>
    <button class="btn primary" @click="$emit('upload')">＋ 上传 PDF</button>
  </header>
</template>

<script setup>
defineEmits(['upload']);
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
.topbar .btn.primary { margin-left: auto; }
</style>
