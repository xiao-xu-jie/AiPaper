<template>
  <div class="model-switcher">
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
  display: flex; gap: 4px; align-items: center;
}
.switcher-select {
  padding: 3px 6px;
  border: 1px solid var(--border);
  border-radius: 5px;
  font-size: 12px;
  color: var(--text);
  background: var(--panel);
  cursor: pointer;
  max-width: 130px;
  outline: none;
  transition: border-color .15s;
}
.switcher-select:hover { border-color: var(--primary); }
.switcher-select:focus { border-color: var(--primary); }
.switcher-select:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
