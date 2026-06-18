<template>
  <Teleport to="body">
    <div v-if="modelValue" class="dialog-overlay" @click="close">
      <div class="dialog-modal" @click.stop>
        <div class="dialog-header">
          <h2>⚙️ MinerU 配置</h2>
          <button class="close-btn" @click="close">✕</button>
        </div>
        <div class="dialog-body">
          <div class="form-row">
            <label>MinerU Token
              <div class="input-with-link">
                <input v-model="cfg.token" type="password" placeholder="在 mineru.net API 管理页创建" />
                <a href="https://mineru.net/apiManage/token" target="_blank" class="link-btn" title="前往创建 Token">🔗</a>
              </div>
            </label>
          </div>
          <div class="form-row">
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
        </div>
        <div class="dialog-footer">
          <button class="btn" @click="$emit('pickDir')">📁 选择数据文件夹</button>
          <button class="btn primary" :class="{ unsaved: dirty }" @click="save">
            保存{{ dirty ? ' *' : '' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, watch } from 'vue';
import { useConfigStore } from '../stores/config.js';

const props = defineProps({ modelValue: Boolean });
const emit = defineEmits(['update:modelValue', 'pickDir']);

const cfg = useConfigStore();
const dirty = ref(false);

watch(
  () => [cfg.token, cfg.model, cfg.lang],
  () => { dirty.value = true; }
);

function close() {
  emit('update:modelValue', false);
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
  max-width: 520px; width: 100%;
  display: flex; flex-direction: column;
}
.dialog-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 24px; border-bottom: 1px solid var(--border);
}
.dialog-header h2 { margin: 0; font-size: 18px; }
.close-btn {
  border: none; background: transparent; font-size: 22px;
  cursor: pointer; padding: 4px 8px; border-radius: 6px;
  transition: background .15s;
}
.close-btn:hover { background: #f0f1f3; }
.dialog-body { padding: 20px 24px; }
.form-row {
  display: flex; flex-wrap: wrap; gap: 14px; align-items: flex-end;
}
.form-row + .form-row { margin-top: 14px; }
label {
  display: flex; flex-direction: column; gap: 4px;
  font-size: 12px; color: var(--muted);
  flex: 1; min-width: 160px;
}
input, select {
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: 7px;
  font-size: 14px;
  color: var(--text);
  background: #fff;
  width: 100%;
}
input[type="password"] { min-width: 220px; }
.input-with-link { display: flex; gap: 4px; align-items: center; }
.link-btn {
  border: 1px solid var(--border); background: var(--panel); border-radius: 7px;
  padding: 6px 10px; font-size: 16px; text-decoration: none;
  cursor: pointer; transition: .15s; display: flex; align-items: center;
}
.link-btn:hover { background: #f0f1f3; }
.dialog-footer {
  display: flex; gap: 12px; justify-content: flex-end;
  padding: 16px 24px; border-top: 1px solid var(--border);
}
.btn.unsaved { border-color: var(--orange); color: var(--orange); font-weight: 600; }
</style>
