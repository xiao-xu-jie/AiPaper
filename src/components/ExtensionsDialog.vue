<template>
  <Teleport to="body">
    <div v-if="modelValue" class="dialog-overlay" @click="close">
      <div class="dialog-modal" @click.stop>
        <div class="dialog-header">
          <div>
            <h2>扩展</h2>
            <p>连接外部知识库并同步论文笔记</p>
          </div>
          <button class="close-btn" @click="close">×</button>
        </div>

        <div class="dialog-body">
          <section class="section">
            <div class="section-head">
              <div>
                <h3>思源笔记</h3>
                <p>本地 API 默认地址为 http://127.0.0.1:6806</p>
              </div>
              <button class="btn small" :disabled="testing" @click="testConnection">
                {{ testing ? '测试中...' : '测试连接' }}
              </button>
            </div>

            <div class="form-grid">
              <label>端点
                <input v-model="form.endpoint" placeholder="http://127.0.0.1:6806" />
              </label>
              <label>API Token
                <input v-model="form.token" type="password" placeholder="Authorization: Token ..." />
              </label>
              <label>目标笔记本
                <div class="inline-control">
                  <select v-model="form.notebook">
                    <option value="">选择笔记本</option>
                    <option v-for="notebook in notebooks" :key="notebook.id" :value="notebook.id">
                      {{ notebook.name }}{{ notebook.closed ? '（已关闭）' : '' }}
                    </option>
                  </select>
                  <button class="btn small" :disabled="loadingNotebooks" @click="loadNotebooks">
                    {{ loadingNotebooks ? '加载中' : '刷新' }}
                  </button>
                </div>
              </label>
              <label>资源目录
                <input v-model="form.assetsDirPath" placeholder="/assets/" />
              </label>
            </div>
          </section>

          <section class="section">
            <div class="section-head">
              <div>
                <h3>上传阅读笔记</h3>
                <p>{{ currentPaperTitle }}</p>
              </div>
              <button class="btn primary small" :disabled="uploading || !papers.currentId" @click="uploadCurrentNote">
                {{ uploading ? '上传中...' : '上传当前笔记' }}
              </button>
            </div>

            <div class="form-grid">
              <label>文档路径
                <input v-model="upload.path" placeholder="/AI Paper/论文标题" />
              </label>
              <label>文档标题
                <input v-model="upload.title" placeholder="思源文档标题" />
              </label>
            </div>

            <div class="metadata-box">
              <div class="metadata-head">
                <span>元数据</span>
                <button class="btn small" @click="addMetaRow">添加</button>
              </div>
              <div v-for="(row, index) in upload.metadata" :key="index" class="metadata-row">
                <input v-model="row.key" placeholder="字段名，如 source" />
                <input v-model="row.value" placeholder="字段值" />
                <button class="btn-icon danger" title="删除" @click="removeMetaRow(index)">×</button>
              </div>
              <div v-if="!upload.metadata.length" class="empty-line">暂无元数据</div>
            </div>
          </section>
        </div>

        <div class="dialog-footer">
          <span class="status">{{ status }}</span>
          <button class="btn" @click="save">保存配置</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, inject, reactive, ref, watch } from 'vue';
import { usePapersStore } from '../stores/papers.js';
import * as store from '../lib/store.js';
import * as siyuan from '../lib/siyuan.js';

const props = defineProps({ modelValue: Boolean });
const emit = defineEmits(['update:modelValue']);

const toast = inject('toast');
const papers = usePapersStore();

const form = reactive(siyuan.loadConfig());
const notebooks = ref([]);
const status = ref('');
const testing = ref(false);
const loadingNotebooks = ref(false);
const uploading = ref(false);
const upload = reactive({ path: '/AI Paper', title: '', metadata: [] });

const currentPaperTitle = computed(() => {
  const paper = papers.currentPaper;
  if (!paper) return '请先选择一篇论文';
  return paper.remark || paper.title || paper.fileName || paper.id;
});

watch(() => props.modelValue, (open) => {
  if (!open) return;
  Object.assign(form, siyuan.loadConfig());
  resetUploadForm();
  if (form.endpoint && form.token) loadNotebooks();
});

watch(() => papers.currentId, () => {
  if (props.modelValue) resetUploadForm();
});

function close() {
  emit('update:modelValue', false);
}

function save() {
  siyuan.saveConfig(form);
  status.value = '配置已保存';
  toast?.('扩展配置已保存', 'success');
}

function getConfig() {
  return {
    endpoint: siyuan.normalizeEndpoint(form.endpoint),
    token: form.token.trim(),
    notebook: form.notebook,
    assetsDirPath: siyuan.normalizeAssetPath(form.assetsDirPath),
    defaultPath: siyuan.normalizeDocPath(upload.path || form.defaultPath),
  };
}

async function testConnection() {
  testing.value = true;
  status.value = '';
  try {
    const version = await siyuan.getVersion(getConfig());
    status.value = `连接成功，思源版本 ${version}`;
    toast?.('思源连接成功', 'success');
  } catch (e) {
    status.value = e.message;
    toast?.('思源连接失败：' + e.message, 'error');
  } finally {
    testing.value = false;
  }
}

async function loadNotebooks() {
  loadingNotebooks.value = true;
  status.value = '';
  try {
    notebooks.value = await siyuan.listNotebooks(getConfig());
    if (!form.notebook && notebooks.value.length) form.notebook = notebooks.value.find((n) => !n.closed)?.id || notebooks.value[0].id;
  } catch (e) {
    status.value = e.message;
    toast?.('读取思源笔记本失败：' + e.message, 'error');
  } finally {
    loadingNotebooks.value = false;
  }
}

function resetUploadForm() {
  const paper = papers.currentPaper;
  const title = siyuan.sanitizeTitle(paper?.remark || paper?.title || paper?.fileName || '阅读笔记');
  const basePath = siyuan.normalizeDocPath(form.defaultPath || '/AI Paper');
  upload.title = title;
  upload.path = `${basePath}/${title}`;
  upload.metadata = siyuan.buildDefaultMetadata(paper);
}

function sanitizeTitle(title) {
  return siyuan.sanitizeTitle(title);
}

function addMetaRow() {
  upload.metadata.push({ key: '', value: '' });
}

function removeMetaRow(index) {
  upload.metadata.splice(index, 1);
}

async function uploadCurrentNote() {
  if (!papers.currentId) {
    toast?.('请先选择一篇论文', 'error');
    return;
  }
  const config = getConfig();
  if (!config.endpoint || !config.token || !form.notebook) {
    toast?.('请先填写思源端点、Token 并选择笔记本', 'error');
    return;
  }
  uploading.value = true;
  status.value = '读取阅读笔记...';
  try {
    const note = await store.loadNote(papers.currentId);
    if (!note?.trim()) throw new Error('当前论文还没有阅读笔记');
    const title = upload.title.trim() || currentPaperTitle.value;
    const docId = await siyuan.uploadPaperNote({
      config,
      notebook: form.notebook,
      docPath: upload.path,
      title,
      markdown: note,
      paperId: papers.currentId,
      metadata: upload.metadata,
      loadBlob: store.loadAssetBlob,
      onProgress: (text) => { status.value = text; },
    });
    siyuan.saveConfig({ ...form, defaultPath: siyuan.parentDocPath(upload.path) });
    status.value = `上传完成：${docId}`;
    toast?.('阅读笔记已上传到思源', 'success');
  } catch (e) {
    status.value = e.message;
    toast?.('上传失败：' + e.message, 'error');
  } finally {
    uploading.value = false;
  }
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
  width: min(760px, 100%);
  max-height: 88vh;
  background: #fff;
  border-radius: 10px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.22);
  display: flex;
  flex-direction: column;
}
.dialog-header {
  padding: 18px 22px;
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.dialog-header h2 { margin: 0; font-size: 18px; }
.dialog-header p,
.section-head p {
  margin: 4px 0 0;
  color: var(--muted);
  font-size: 12px;
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
.dialog-body {
  overflow-y: auto;
  padding: 18px 22px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.section {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 14px;
}
.section-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 12px;
}
.section-head h3 { margin: 0; font-size: 15px; }
.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
label {
  display: flex;
  flex-direction: column;
  gap: 5px;
  color: var(--muted);
  font-size: 12px;
  min-width: 0;
}
input,
select {
  width: 100%;
  border: 1px solid var(--border);
  border-radius: 7px;
  padding: 8px 10px;
  font-size: 13px;
  color: var(--text);
  background: #fff;
  outline: none;
}
input:focus,
select:focus { border-color: var(--primary); }
.inline-control {
  display: flex;
  gap: 8px;
}
.inline-control .btn { flex-shrink: 0; }
.metadata-box {
  margin-top: 12px;
  border: 1px dashed var(--border);
  border-radius: 8px;
  padding: 10px;
}
.metadata-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  font-size: 13px;
  font-weight: 600;
}
.metadata-row {
  display: grid;
  grid-template-columns: 1fr 1.4fr 32px;
  gap: 8px;
  margin-top: 8px;
}
.btn.small { padding: 6px 12px; font-size: 13px; }
.btn-icon {
  border: 1px solid var(--border);
  background: #fff;
  border-radius: 7px;
  cursor: pointer;
  font-size: 18px;
}
.btn-icon.danger { color: var(--red); }
.empty-line {
  color: var(--muted);
  font-size: 12px;
  padding: 10px 0;
}
.dialog-footer {
  border-top: 1px solid var(--border);
  padding: 14px 22px;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
}
.status {
  margin-right: auto;
  color: var(--muted);
  font-size: 12px;
}
@media (max-width: 720px) {
  .form-grid { grid-template-columns: 1fr; }
  .metadata-row { grid-template-columns: 1fr; }
}
</style>
