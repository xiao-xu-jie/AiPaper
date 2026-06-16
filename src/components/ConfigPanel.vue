<template>
  <section class="config">
    <div class="config-row">
      <label>MinerU Token
        <input v-model="cfg.token" type="password" placeholder="在 mineru.net API 管理页创建" />
      </label>
      <label>模型
        <select v-model="cfg.model">
          <option value="vlm">vlm（推荐）</option>
          <option value="pipeline">pipeline</option>
        </select>
      </label>
      <label>语言
        <select v-model="cfg.lang">
          <option value="ch">中英文</option>
          <option value="en">英文</option>
          <option value="japan">日文</option>
          <option value="korean">韩文</option>
        </select>
      </label>
      <label>代理前缀（可选）
        <input v-model="cfg.proxy" type="text" placeholder="http://localhost:8788/proxy?url=" />
      </label>
    </div>
    <div class="config-row">
      <label>AI 接口地址
        <input v-model="cfg.aiUrl" type="text" placeholder="https://api.openai.com/v1" />
      </label>
      <label>AI 模型
        <input v-model="cfg.aiModel" type="text" placeholder="gpt-4o" />
      </label>
      <label>AI 密钥
        <input v-model="cfg.aiKey" type="password" placeholder="sk-..." />
      </label>
      <button class="btn" @click="cfg.save()">保存设置</button>
      <button class="btn" @click="$emit('pickDir')">📁 选择数据文件夹</button>
    </div>
  </section>
</template>

<script setup>
import { useConfigStore } from '../stores/config.js';
const cfg = useConfigStore();
defineEmits(['pickDir']);
</script>

<style scoped>
.config {
  background: var(--panel);
  border-bottom: 1px solid var(--border);
  padding: 12px 20px;
  flex-shrink: 0;
}
.config-row {
  display: flex; flex-wrap: wrap; gap: 14px; align-items: flex-end;
}
.config-row + .config-row { margin-top: 10px; }
label {
  display: flex; flex-direction: column; gap: 4px;
  font-size: 12px; color: var(--muted);
}
input, select {
  padding: 7px 10px;
  border: 1px solid var(--border);
  border-radius: 7px;
  font-size: 14px;
  min-width: 160px;
  color: var(--text);
  background: #fff;
}
input[type="password"], input[placeholder*="api"], input[placeholder*="sk-"] { min-width: 220px; }
</style>
