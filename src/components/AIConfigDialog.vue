<template>
  <Teleport to="body">
    <div v-if="modelValue" class="dialog-overlay" @click="close">
      <div class="dialog-modal" @click.stop>
        <div class="dialog-header">
          <h2>🤖 AI 模型配置</h2>
          <button class="close-btn" @click="close">✕</button>
        </div>
        <div class="dialog-body">
          <div class="form-row">
            <label>AI 提供商
              <select v-model="cfg.currentProviderId" @change="onProviderChange">
                <option value="">-- 选择提供商 --</option>
                <option v-for="p in cfg.providers" :key="p.id" :value="p.id">
                  {{ p.name }}{{ p.builtin ? ' (免费)' : '' }}
                </option>
              </select>
            </label>
            <label>AI 模型
              <div class="model-input-wrap">
                <select v-if="cfg.currentModels.length" v-model="cfg.aiModel" class="model-select">
                  <option value="">-- 选择模型 --</option>
                  <option v-for="m in cfg.currentModels" :key="m.id" :value="m.id">{{ m.name }}</option>
                </select>
                <input v-else v-model="cfg.aiModel" type="text" placeholder="点击 ⚙️ 获取模型" />
                <button v-if="cfg.currentProvider" class="btn-icon" :class="{ loading: fetching }" title="获取模型列表" @click="fetchModels">↻</button>
                <button v-if="cfg.currentProvider" class="btn-icon" title="添加自定义模型" @click="addCustomModel">+</button>
              </div>
            </label>
            <button v-if="cfg.currentProvider" class="btn-icon" :class="{ active: showProviderDetail }" title="提供商设置" @click="showProviderDetail = !showProviderDetail">⚙️</button>
            <button class="btn small" @click="showAddProvider = !showAddProvider">+ 提供商</button>
          </div>

          <div v-if="cfg.currentProvider && showProviderDetail" class="provider-detail">
            <div class="form-row">
              <label>名称
                <input
                  :value="cfg.currentProvider.name"
                  type="text"
                  :readonly="cfg.currentProvider.builtin"
                  @input="cfg.updateProvider(cfg.currentProviderId, { name: $event.target.value })"
                />
              </label>
              <label>接口地址
                <input
                  :value="cfg.currentProvider.baseUrl"
                  type="text"
                  :readonly="cfg.currentProvider.builtin"
                  @input="cfg.updateProvider(cfg.currentProviderId, { baseUrl: $event.target.value })"
                  @blur="fetchModels"
                />
              </label>
              <label>密钥
                <input
                  :value="cfg.currentProvider.apiKey"
                  type="password"
                  placeholder="免费提供商可不填"
                  @input="cfg.updateProvider(cfg.currentProviderId, { apiKey: $event.target.value })"
                  @blur="fetchModels"
                />
              </label>
              <button
                v-if="!cfg.currentProvider.builtin"
                class="btn btn-danger small"
                @click="removeCurrentProvider"
              >🗑 删除</button>
            </div>
            <div v-if="cfg.currentProvider.customModels?.length" class="custom-models">
              <span class="custom-models-label">自定义模型：</span>
              <span v-for="m in cfg.currentProvider.customModels" :key="m.id" class="custom-model-tag">
                {{ m.id }}
                <button class="tag-remove" @click="cfg.removeCustomModel(cfg.currentProviderId, m.id)">×</button>
              </span>
            </div>
          </div>

          <div v-if="showAddProvider" class="add-provider-form">
            <div class="form-row">
              <label>名称
                <input v-model="newProvider.name" type="text" placeholder="如：我的 OpenAI" />
              </label>
              <label>接口地址
                <input v-model="newProvider.baseUrl" type="text" placeholder="https://api.openai.com/v1" />
              </label>
              <label>密钥（可选）
                <input v-model="newProvider.apiKey" type="password" placeholder="sk-..." />
              </label>
              <button class="btn small" @click="confirmAddProvider">确认</button>
              <button class="btn small" @click="showAddProvider = false">取消</button>
            </div>
          </div>

          <div class="template-section">
            <button class="btn small" @click="showTemplate = !showTemplate">📝 笔记模板</button>
            <div v-if="showTemplate" class="template-editor">
              <div class="template-label">阅读笔记模板（支持 <code>{{title}}</code> 占位符）</div>
              <textarea v-model="cfg.noteTemplate" rows="8" class="template-textarea" />
            </div>
          </div>
        </div>
        <div class="dialog-footer">
          <button class="btn primary" :class="{ unsaved: dirty }" @click="save">
            保存{{ dirty ? ' *' : '' }}
          </button>
        </div>
        <div v-if="fetchError" class="fetch-error">{{ fetchError }}</div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, watch } from 'vue';
import { useConfigStore } from '../stores/config.js';

const props = defineProps({ modelValue: Boolean });
const emit = defineEmits(['update:modelValue']);

const cfg = useConfigStore();
const showProviderDetail = ref(false);
const showAddProvider = ref(false);
const showTemplate = ref(false);
const dirty = ref(false);

const newProvider = ref({ name: '', baseUrl: '', apiKey: '' });
const fetching = ref(false);
const fetchError = ref('');

watch(
  () => [cfg.currentProviderId, cfg.aiModel, cfg.noteTemplate],
  () => { dirty.value = true; }
);
watch(
  () => cfg.providers,
  () => { dirty.value = true; },
  { deep: true }
);

function close() {
  emit('update:modelValue', false);
}

function onProviderChange() {
  fetchError.value = '';
}

async function fetchModels() {
  const p = cfg.currentProvider;
  if (!p || !p.baseUrl) return;
  fetching.value = true;
  fetchError.value = '';
  try {
    const url = p.baseUrl.trim().replace(/\/$/, '');
    const targetUrl = `${url}/models`;
    const proxyPrefix = window.location.protocol !== 'file:' && !navigator.userAgent.includes('Electron')
      ? `${window.location.origin}/proxy?url=`
      : '';
    const fetchUrl = proxyPrefix ? proxyPrefix + encodeURIComponent(targetUrl) : targetUrl;
    const res = await fetch(fetchUrl, {
      headers: p.apiKey ? { Authorization: `Bearer ${p.apiKey}` } : {},
    });
    const json = await res.json();
    if (!res.ok) {
      fetchError.value = json?.error?.message || `获取失败 (${res.status})`;
      return;
    }
    const models = (json.data || []).map((m) => ({ id: m.id, name: m.id })).sort((a, b) => a.id.localeCompare(b.id));
    cfg.setProviderModels(p.id, models);
  } catch (e) {
    fetchError.value = '请求失败：' + e.message;
  } finally {
    fetching.value = false;
  }
}

function confirmAddProvider() {
  const { name, baseUrl, apiKey } = newProvider.value;
  if (!name.trim() || !baseUrl.trim()) {
    fetchError.value = '名称和接口地址不能为空';
    return;
  }
  cfg.addProvider(name.trim(), baseUrl.trim(), apiKey.trim());
  newProvider.value = { name: '', baseUrl: '', apiKey: '' };
  showAddProvider.value = false;
  fetchError.value = '';
}

function removeCurrentProvider() {
  if (!cfg.currentProvider) return;
  if (!confirm(`确认删除提供商「${cfg.currentProvider.name}」？`)) return;
  cfg.removeProvider(cfg.currentProviderId);
  showProviderDetail.value = false;
}

function addCustomModel() {
  const modelId = prompt('输入自定义模型 ID（如 gpt-4o）：');
  if (!modelId || !modelId.trim()) return;
  cfg.addCustomModel(cfg.currentProviderId, modelId.trim());
}

function save() {
  cfg.save();
  dirty.value = false;
  close();
}
</script>

<style scoped>
.dialog-overlay {
  position: fixed; inset: 0; z-index: 1000;
  background: rgba(0, 0, 0, 0.5);
  display: flex; align-items: center; justify-content: center;
  padding: 20px;
}
.dialog-modal {
  background: #fff; border-radius: 12px; box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  max-width: 680px; width: 100%; max-height: 85vh;
  display: flex; flex-direction: column;
}
.dialog-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 24px; border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}
.dialog-header h2 { margin: 0; font-size: 18px; }
.close-btn {
  border: none; background: transparent; font-size: 22px;
  cursor: pointer; padding: 4px 8px; border-radius: 6px;
  transition: background .15s;
}
.close-btn:hover { background: #f0f1f3; }
.dialog-body {
  padding: 20px 24px; overflow-y: auto; flex: 1;
}
.form-row {
  display: flex; flex-wrap: wrap; gap: 12px; align-items: flex-end;
}
.form-row + .form-row { margin-top: 12px; }
label {
  display: flex; flex-direction: column; gap: 4px;
  font-size: 12px; color: var(--muted);
  flex: 1; min-width: 150px;
}
input, select {
  padding: 7px 10px;
  border: 1px solid var(--border);
  border-radius: 7px;
  font-size: 14px;
  color: var(--text);
  background: #fff;
  width: 100%;
}
input[readonly] { background: #f5f5f5; color: var(--muted); }
.model-input-wrap { display: flex; gap: 4px; align-items: center; }
.model-select { min-width: 170px; }
.btn-icon {
  border: 1px solid var(--border); background: var(--panel); border-radius: 7px;
  cursor: pointer; font-size: 15px; padding: 5px 9px; color: var(--text); transition: .15s;
  height: 34px; flex-shrink: 0;
}
.btn-icon:hover { background: #f0f1f3; }
.btn-icon.active { background: var(--primary); color: #fff; border-color: var(--primary); }
.btn-icon.loading { animation: spin .8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.btn.small { padding: 6px 14px; font-size: 13px; flex-shrink: 0; }
.btn.unsaved { border-color: var(--orange); color: var(--orange); font-weight: 600; }
.btn-danger { color: var(--red); border-color: var(--red); }
.btn-danger:hover { background: var(--red); color: #fff; }
.provider-detail {
  margin-top: 12px;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: rgba(0,0,0,0.02);
}
.add-provider-form {
  margin-top: 12px;
  padding: 12px;
  border: 1px dashed var(--border);
  border-radius: 8px;
}
.custom-models {
  display: flex; flex-wrap: wrap; gap: 6px; align-items: center;
  margin-top: 10px;
  font-size: 12px; color: var(--muted);
}
.custom-models-label { margin-right: 4px; }
.custom-model-tag {
  display: inline-flex; align-items: center; gap: 4px;
  background: #f0f1f3; border-radius: 4px; padding: 2px 8px; font-size: 12px;
}
.tag-remove {
  border: none; background: none; cursor: pointer; color: var(--red);
  font-size: 14px; padding: 0; line-height: 1;
}
.template-section { margin-top: 14px; }
.template-editor { margin-top: 8px; display: flex; flex-direction: column; gap: 6px; }
.template-label { font-size: 12px; color: var(--muted); }
.template-label code { background: #f0f1f3; padding: 1px 4px; border-radius: 3px; }
.template-textarea { width: 100%; font-family: "SF Mono", Consolas, monospace; font-size: 13px; padding: 10px; border: 1px solid var(--border); border-radius: 8px; resize: vertical; line-height: 1.6; outline: none; }
.template-textarea:focus { border-color: var(--primary); }
.dialog-footer {
  display: flex; gap: 12px; justify-content: flex-end;
  padding: 16px 24px; border-top: 1px solid var(--border);
  flex-shrink: 0;
}
.fetch-error { padding: 0 24px 16px; font-size: 12px; color: var(--red); }
</style>
