<template>
  <Teleport to="body">
    <div v-if="modelValue" class="details-backdrop" @click="close">
      <div class="details-modal" @click.stop>
        <div class="details-header">
          <div>
            <h2>论文信息与状态</h2>
            <p>{{ paper?.fileName || paper?.title || '未选择论文' }}</p>
          </div>
          <button class="close-btn" @click="close">×</button>
        </div>

        <div class="details-body">
          <section class="details-section">
            <div class="section-title">阅读工作流</div>
            <div class="form-grid">
              <label>阅读状态
                <select v-model="workflow.readingStatus">
                  <option v-for="item in READING_STATUS_OPTIONS" :key="item.id" :value="item.id">
                    {{ item.label }}
                  </option>
                </select>
              </label>
              <label>优先级
                <select v-model="workflow.priority">
                  <option v-for="item in PRIORITY_OPTIONS" :key="item.id" :value="item.id">
                    {{ item.label }}
                  </option>
                </select>
              </label>
              <label>评分
                <input v-model.number="workflow.rating" type="number" min="0" max="5" step="1" />
              </label>
              <label>截止日期
                <input v-model="workflow.deadline" type="date" />
              </label>
            </div>
            <label class="full-field">阅读目的
              <textarea v-model="workflow.readingPurpose" rows="3" placeholder="例如：为综述补充相关工作，或准备复现实验" />
            </label>
            <div class="check-row">
              <label class="check-label">
                <input v-model="workflow.reproduced" type="checkbox" />
                已复现
              </label>
              <label class="check-label">
                <input v-model="workflow.inSurvey" type="checkbox" />
                已加入综述
              </label>
            </div>
          </section>

          <section class="details-section">
            <div class="section-head">
              <div>
                <div class="section-title">结构化元数据</div>
                <p>解析完成后会自动提取，也可以在这里修正。</p>
              </div>
              <button class="btn small" :disabled="extracting || paper?.state !== 'done'" @click="extractAgain">
                {{ extracting ? '提取中...' : '重新提取' }}
              </button>
            </div>

            <div class="form-grid">
              <label>标题
                <input v-model="metadata.title" />
              </label>
              <label>年份
                <input v-model="metadata.year" placeholder="2026" />
              </label>
              <label>作者
                <input v-model="metadata.authors" placeholder="作者列表" />
              </label>
              <label>机构
                <input v-model="metadata.institutions" placeholder="机构列表" />
              </label>
              <label>会议 / 期刊
                <input v-model="metadata.venue" />
              </label>
              <label>DOI
                <input v-model="metadata.doi" />
              </label>
              <label>arXiv
                <input v-model="metadata.arxivId" />
              </label>
              <label>代码仓库
                <input v-model="metadata.codeUrl" placeholder="https://github.com/..." />
              </label>
            </div>

            <label class="full-field">关键词
              <input v-model="keywordsText" placeholder="用逗号、分号或顿号分隔" />
            </label>
            <label class="full-field">摘要
              <textarea v-model="metadata.abstract" rows="5" />
            </label>
          </section>
        </div>

        <div class="details-footer">
          <span class="status">{{ statusText }}</span>
          <button class="btn" @click="close">取消</button>
          <button class="btn primary" @click="save">保存</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, inject, reactive, ref, watch } from 'vue';
import { usePapersStore } from '../stores/papers.js';
import {
  PRIORITY_OPTIONS,
  READING_STATUS_OPTIONS,
  normalizeMetadata,
  normalizeWorkflowFields,
} from '../lib/paperMeta.js';

const props = defineProps({
  modelValue: Boolean,
  paperId: { type: String, default: '' },
});
const emit = defineEmits(['update:modelValue']);

const papers = usePapersStore();
const toast = inject('toast', () => {});

const metadata = reactive(normalizeMetadata({}));
const workflow = reactive(normalizeWorkflowFields({}));
const keywordsText = ref('');
const statusText = ref('');
const extracting = ref(false);

const paper = computed(() => papers.papers.find((p) => p.id === props.paperId) || null);

function fillForm() {
  const p = paper.value;
  if (!p) return;
  Object.assign(metadata, normalizeMetadata(p.metadata || {}, p.title || p.fileName || ''));
  Object.assign(workflow, normalizeWorkflowFields(p));
  keywordsText.value = (metadata.keywords || []).join('，');
  statusText.value = metadata.extractedAt
    ? `上次提取：${new Date(metadata.extractedAt).toLocaleString()}`
    : '';
}

watch(() => props.modelValue, (open) => {
  if (open) fillForm();
});

watch(paper, () => {
  if (props.modelValue) fillForm();
});

function close() {
  emit('update:modelValue', false);
}

async function extractAgain() {
  if (!paper.value || extracting.value) return;
  extracting.value = true;
  statusText.value = '';
  try {
    const next = await papers.extractMetadata(paper.value.id, { updateTitle: false });
    if (next) {
      Object.assign(metadata, next);
      keywordsText.value = (next.keywords || []).join('，');
      statusText.value = `已重新提取：${new Date(next.extractedAt).toLocaleString()}`;
      toast('论文信息已重新提取', 'success');
    }
  } catch (e) {
    statusText.value = e.message;
    toast('提取失败：' + e.message, 'error');
  } finally {
    extracting.value = false;
  }
}

async function save() {
  if (!paper.value) return;
  await papers.updateMetadata(paper.value.id, {
    ...metadata,
    keywords: keywordsText.value,
  });
  await papers.updateWorkflow(paper.value.id, workflow);
  toast('论文信息已保存', 'success');
  close();
}
</script>

<style scoped>
.details-backdrop {
  position: fixed; inset: 0; z-index: 1000;
  background: rgba(0, 0, 0, 0.5);
  display: flex; align-items: center; justify-content: center;
  padding: 20px;
}
.details-modal {
  width: min(780px, 100%);
  max-height: 88vh;
  background: #fff;
  border-radius: 10px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, .22);
  display: flex;
  flex-direction: column;
}
.details-header {
  padding: 18px 22px;
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
.details-header h2 { margin: 0; font-size: 18px; }
.details-header p {
  margin-top: 4px;
  color: var(--muted);
  font-size: 12px;
  max-width: 620px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.close-btn {
  border: none;
  background: transparent;
  font-size: 24px;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 6px;
}
.close-btn:hover { background: #f0f1f3; }
.details-body {
  overflow-y: auto;
  padding: 18px 22px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.details-section {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 14px;
}
.section-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}
.section-title {
  font-size: 15px;
  font-weight: 600;
  margin-bottom: 10px;
}
.section-head .section-title { margin-bottom: 4px; }
.section-head p {
  margin: 0;
  color: var(--muted);
  font-size: 12px;
}
.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
label,
.full-field {
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
  color: var(--muted);
  font-size: 12px;
}
.full-field { margin-top: 12px; }
input,
select,
textarea {
  width: 100%;
  border: 1px solid var(--border);
  border-radius: 7px;
  padding: 8px 10px;
  color: var(--text);
  font-size: 13px;
  background: #fff;
  outline: none;
  font-family: inherit;
}
textarea {
  resize: vertical;
  line-height: 1.5;
}
input:focus,
select:focus,
textarea:focus { border-color: var(--primary); }
.check-row {
  display: flex;
  gap: 18px;
  margin-top: 12px;
}
.check-label {
  flex-direction: row;
  align-items: center;
  color: var(--text);
}
.check-label input {
  width: auto;
}
.details-footer {
  border-top: 1px solid var(--border);
  padding: 14px 22px;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
}
.status {
  margin-right: auto;
  color: var(--muted);
  font-size: 12px;
}
@media (max-width: 720px) {
  .form-grid { grid-template-columns: 1fr; }
}
</style>
