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
    </div>
    <div class="config-row">
      <label>AI 接口地址
        <input v-model="cfg.aiUrl" type="text" placeholder="https://api.openai.com/v1" @blur="fetchModels" />
      </label>
      <label>AI 密钥
        <input v-model="cfg.aiKey" type="password" placeholder="sk-..." @blur="fetchModels" />
      </label>
      <label>AI 模型
        <div class="model-input-wrap">
          <select v-if="models.length" v-model="cfg.aiModel" class="model-select">
            <option value="">-- 选择模型 --</option>
            <option v-for="m in models" :key="m.id" :value="m.id">{{ m.id }}</option>
          </select>
          <input v-else v-model="cfg.aiModel" type="text" placeholder="gpt-4o" />
          <button class="btn-icon" :class="{ loading: fetching }" title="获取模型列表" @click="fetchModels">↻</button>
        </div>
      </label>
      <button class="btn" :class="{ unsaved: dirty }" @click="cfg.save(); dirty = false">
        保存设置{{ dirty ? ' *' : '' }}
      </button>
      <button class="btn" @click="$emit('pickDir')">📁 选择数据文件夹</button>
      <button class="btn" @click="showTemplate = !showTemplate">📝 笔记模板</button>
    </div>
    <div v-if="showTemplate" class="template-editor">
      <div class="template-label">阅读笔记模板（支持 <code>{{title}}</code> 占位符）</div>
      <textarea v-model="cfg.noteTemplate" rows="10" class="template-textarea" />
    </div>
    <div v-if="fetchError" class="fetch-error">{{ fetchError }}</div>
  </section>
</template>

<script setup>
import { ref, watch } from 'vue';
import { useConfigStore } from '../stores/config.js';

const cfg = useConfigStore();
defineEmits(['pickDir']);
const showTemplate = ref(false);
const dirty = ref(false);

// 监听所有配置字段变化
watch(
  () => [cfg.token, cfg.model, cfg.lang, cfg.aiUrl, cfg.aiModel, cfg.aiKey, cfg.noteTemplate],
  () => { dirty.value = true; }
);

const models = ref([]);
const fetching = ref(false);
const fetchError = ref('');

async function fetchModels() {
  const url = cfg.aiUrl.trim().replace(/\/$/, '');
  if (!url) return;
  fetching.value = true;
  fetchError.value = '';
  try {
    const targetUrl = `${url}/models`;
    const proxyPrefix = window.location.protocol !== 'file:' && !navigator.userAgent.includes('Electron')
      ? `${window.location.origin}/proxy?url=`
      : '';
    const fetchUrl = proxyPrefix ? proxyPrefix + encodeURIComponent(targetUrl) : targetUrl;
    const res = await fetch(fetchUrl, {
      headers: cfg.aiKey ? { Authorization: `Bearer ${cfg.aiKey}` } : {},
    });
    const json = await res.json();
    if (!res.ok) {
      fetchError.value = json?.error?.message || `获取失败 (${res.status})`;
      return;
    }
    models.value = (json.data || []).sort((a, b) => a.id.localeCompare(b.id));
  } catch (e) {
    fetchError.value = '请求失败：' + e.message;
  } finally {
    fetching.value = false;
  }
}
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
input[type="password"] { min-width: 220px; }
.model-input-wrap { display: flex; gap: 4px; align-items: center; }
.model-select { min-width: 180px; }
.btn-icon {
  border: 1px solid var(--border); background: var(--panel); border-radius: 7px;
  cursor: pointer; font-size: 16px; padding: 5px 9px; color: var(--text); transition: .15s;
}
.btn-icon:hover { background: #f0f1f3; }
.btn-icon.loading { animation: spin .8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.fetch-error { margin-top: 6px; font-size: 12px; color: var(--red); }
.btn.unsaved { border-color: var(--orange); color: var(--orange); font-weight: 600; }
.template-editor { margin-top: 10px; display: flex; flex-direction: column; gap: 6px; }
.template-label { font-size: 12px; color: var(--muted); }
.template-label code { background: #f0f1f3; padding: 1px 4px; border-radius: 3px; }
.template-textarea { width: 100%; font-family: "SF Mono", Consolas, monospace; font-size: 13px; padding: 10px; border: 1px solid var(--border); border-radius: 8px; resize: vertical; line-height: 1.6; outline: none; }
.template-textarea:focus { border-color: var(--primary); }
</style>

