<template>
  <div class="model-switcher">
    <label class="switcher-field">
      <span class="switcher-label">供应商</span>
      <select
        v-model="providerId"
        class="switcher-select"
        title="切换 AI 提供商"
        @change="onProviderChange"
      >
        <option value="">未选择</option>
        <option v-for="p in cfg.providers" :key="p.id" :value="p.id">
          {{ p.name }}{{ p.builtin ? ' (免费)' : '' }}
        </option>
      </select>
    </label>
    <label class="switcher-field">
      <span class="switcher-label">模型</span>
      <select
        v-model="modelId"
        class="switcher-select"
        :disabled="!providerId"
        title="切换 AI 模型"
        @change="onModelChange"
      >
        <option value="">未选择</option>
        <option v-for="m in availableModels" :key="m.id" :value="m.id">{{ m.name }}</option>
      </select>
    </label>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import { useConfigStore } from '../stores/config.js';

const cfg = useConfigStore();

const providerId = ref(cfg.currentProviderId);
const modelId = ref(cfg.aiModel);

const availableModels = computed(() => {
  const p = cfg.providers.find((p) => p.id === providerId.value);
  if (!p) return [];
  return [...(p.models || []), ...(p.customModels || [])];
});

watch(() => cfg.currentProviderId, (v) => { providerId.value = v; });
watch(() => cfg.aiModel, (v) => { modelId.value = v; });

function onProviderChange() {
  modelId.value = '';
  cfg.quickSwitch(providerId.value, '');
}

function onModelChange() {
  cfg.quickSwitch(providerId.value, modelId.value);
}
</script>

<style scoped>
.model-switcher {
  display: grid;
  grid-template-columns: minmax(82px, 1fr) minmax(82px, 1fr);
  align-items: center;
  gap: 1px;
  min-width: 0;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: #eef0f2;
  padding: 1px;
  overflow: hidden;
}
.switcher-field {
  min-width: 0;
  height: 28px;
  display: flex;
  align-items: center;
  gap: 4px;
  background: var(--panel);
  padding: 0 6px;
}
.switcher-field:first-child { border-radius: 6px 0 0 6px; }
.switcher-field:last-child { border-radius: 0 6px 6px 0; }
.switcher-label {
  flex-shrink: 0;
  font-size: 10px;
  color: var(--muted);
  line-height: 1;
}
.switcher-select {
  min-width: 0;
  width: 100%;
  border: none;
  padding: 0 16px 0 0;
  font-size: 12px;
  color: var(--text);
  background: transparent;
  cursor: pointer;
  outline: none;
}
.switcher-field:focus-within {
  box-shadow: inset 0 0 0 1px var(--primary);
}
.switcher-select:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
