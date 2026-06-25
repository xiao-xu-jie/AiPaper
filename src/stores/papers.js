import { defineStore } from 'pinia';
import * as store from '../lib/store.js';
import * as mineru from '../lib/mineru.js';
import JSZip from 'jszip';
import { normalizeTagNames } from './tags.js';
import {
  defaultWorkflowFields,
  extractMetadataFromMarkdown,
  normalizeMetadata,
  normalizePaperRecord,
  normalizeWorkflowFields,
} from '../lib/paperMeta.js';

function uid() {
  return 'p_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
}

function queueId() {
  return 'q_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
}

export const usePapersStore = defineStore('papers', {
  state: () => ({
    papers: [],
    currentId: null,
    currentMd: null,
    noteTasks: {},
    uploadQueue: [],
    queuePaused: false,
    queueRunning: false,
  }),
  getters: {
    currentPaper: (s) => s.papers.find((p) => p.id === s.currentId) || null,
    noteTask: (s) => (paperId) => s.noteTasks[paperId] || null,
    isNoteGenerating: (s) => (paperId) => Boolean(s.noteTasks[paperId]?.generating),
    queueSummary: (s) => {
      const total = s.uploadQueue.length;
      const done = s.uploadQueue.filter((item) => item.state === 'done').length;
      const failed = s.uploadQueue.filter((item) => item.state === 'failed').length;
      const queued = s.uploadQueue.filter((item) => item.state === 'queued').length;
      const running = s.uploadQueue.filter((item) => item.state === 'running').length;
      return { total, done, failed, queued, running };
    },
  },
  actions: {
    async refresh() {
      let list = [];
      try { list = await store.listPapers(); } catch { list = []; }
      list = list.map((p) => normalizePaperRecord({
        ...p,
        uploadedAt: p.uploadedAt || p.createdAt || null,
        tags: normalizeTagNames(p.tags),
      }));
      // 就地更新，保留响应式引用
      this.papers.splice(0, this.papers.length, ...list);
      const { useFoldersStore } = await import('./folders.js');
      await useFoldersStore().init(this.papers);
      const { useTagsStore } = await import('./tags.js');
      await useTagsStore().init(this.papers);
      if (!this.currentId && this.papers.length) await this.open(this.papers[0].id);
      this._resumeUnfinished();
    },

    async open(id) {
      if (this.currentId === id) {
        // 同一篇：强制清空再赋值，触发 Viewer watch
        this.currentMd = null;
      }
      this.currentId = id;
      const md = await store.loadMarkdown(id).catch(() => null);
      if (this.currentId !== id) return;
      this.currentMd = md;
    },

    async upload(files, cfg) {
      const queueItems = files.map((file) => ({
        id: queueId(),
        file,
        fileName: file.name,
        paperId: '',
        state: 'queued',
        stateText: '等待解析',
        progress: 0,
        error: '',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }));
      this.uploadQueue.push(...queueItems);
      this.queuePaused = false;
      this._runQueue(cfg).catch(() => {});
    },

    async _runQueue(cfg) {
      if (this.queueRunning) return;
      this.queueRunning = true;
      try {
        while (!this.queuePaused) {
          const item = this.uploadQueue.find((q) => q.state === 'queued');
          if (!item) break;
          try {
            await this._processOne(item.file, cfg, item);
            this._updateQueueItem(item, { state: 'done', stateText: '已完成', progress: 100, error: '' });
          } catch (err) {
            this._updateQueueItem(item, {
              state: 'failed',
              stateText: '失败',
              error: err?.message || String(err),
            });
          }
        }
      } finally {
        this.queueRunning = false;
      }
    },

    pauseQueue() {
      this.queuePaused = true;
    },

    resumeQueue(cfg) {
      this.queuePaused = false;
      this._runQueue(cfg).catch(() => {});
    },

    clearFinishedQueue() {
      this.uploadQueue = this.uploadQueue.filter((item) => !['done', 'canceled'].includes(item.state));
    },

    cancelQueueItem(itemId) {
      const item = this.uploadQueue.find((q) => q.id === itemId);
      if (!item || item.state !== 'queued') return false;
      this._updateQueueItem(item, { state: 'canceled', stateText: '已取消', progress: 0 });
      return true;
    },

    retryQueueItem(itemId, cfg) {
      const item = this.uploadQueue.find((q) => q.id === itemId);
      if (!item || item.state !== 'failed') return false;
      this._updateQueueItem(item, {
        state: 'queued',
        stateText: '等待重试',
        progress: 0,
        error: '',
      });
      this.queuePaused = false;
      this._runQueue(cfg).catch(() => {});
      return true;
    },

    _updateQueueItem(item, patch) {
      if (!item) return;
      Object.assign(item, patch, { updatedAt: Date.now() });
    },

    async _processOne(file, cfg, queueItem = null) {
      const paperId = uid();
      this._updateQueueItem(queueItem, {
        paperId,
        state: 'running',
        stateText: '创建论文记录...',
        progress: 1,
      });
      const meta = {
        id: paperId,
        title: file.name.replace(/\.pdf$/i, ''),
        fileName: file.name,
        model: cfg.model,
        language: cfg.lang,
        state: 'uploading',
        progress: 0,
        uploadedAt: Date.now(),
        createdAt: Date.now(),
        tags: [],
        metadata: normalizeMetadata({}, file.name.replace(/\.pdf$/i, '')),
        ...defaultWorkflowFields(),
      };
      this.papers.unshift(meta);
      this.currentId = paperId;
      this.currentMd = null;

      // 加入当前目录
      const { useFoldersStore } = await import('./folders.js');
      await useFoldersStore().addPaper(paperId);

      try {
        await store.savePdf(paperId, file);
        await store.saveMeta(paperId, meta);

        this._patch(paperId, { stateText: '申请上传链接...' });
        this._updateQueueItem(queueItem, { stateText: '申请上传链接...', progress: 3 });
        const { batchId, fileUrls } = await mineru.applyUpload(
          cfg.token,
          [{ name: file.name, data_id: paperId }],
          { model_version: cfg.model, language: cfg.lang },
        );
        this._patch(paperId, { batchId });

        this._patch(paperId, { stateText: '上传中...' });
        this._updateQueueItem(queueItem, { stateText: '上传中...', progress: 5 });
        await mineru.uploadFile(fileUrls[0], file, (p) => {
          this._patch(paperId, { progress: Math.round(p * 100), stateText: `上传中 ${Math.round(p * 100)}%` });
          this._updateQueueItem(queueItem, {
            stateText: `上传中 ${Math.round(p * 100)}%`,
            progress: Math.max(5, Math.round(p * 35)),
          });
        });

        this._patch(paperId, { state: 'running', stateText: '已提交，等待解析...', progress: 0 });
        this._updateQueueItem(queueItem, { stateText: '已提交，等待解析...', progress: 38 });
        await this._resumeParsing(paperId, cfg.token, queueItem);
      } catch (err) {
        this._patch(paperId, { state: 'failed', stateText: err.message, error: err.message });
        throw err;
      }
    },

    async _resumeParsing(paperId, token, queueItem = null) {
      const m = this.papers.find((p) => p.id === paperId);
      if (!m?.batchId) return;
      const result = await mineru.pollUntilDone(token, m.batchId,
        (r) => r.data_id === paperId || r.file_name === m.fileName,
        {
          onUpdate: (r) => {
            const prog = r.extract_progress;
            let text = mineru.STATE_LABELS[r.state] || r.state;
            let pct = 0;
            if (prog?.total_pages) {
              pct = Math.round((prog.extracted_pages / prog.total_pages) * 100);
              text = `解析中 ${prog.extracted_pages}/${prog.total_pages} 页`;
            }
            this._patch(paperId, { state: r.state, stateText: text, progress: pct });
            this._updateQueueItem(queueItem, {
              stateText: text,
              progress: Math.max(40, Math.min(90, 40 + Math.round(pct * 0.5))),
            });
          },
        },
      );
      this._patch(paperId, { stateText: '下载结果...' });
      this._updateQueueItem(queueItem, { stateText: '下载结果...', progress: 94 });
      const buf = await mineru.downloadZip(result.full_zip_url);
      await this._extractZip(paperId, buf);
      this._updateQueueItem(queueItem, { stateText: '提取论文信息...', progress: 97 });
      await this.extractMetadata(paperId, { updateTitle: true }).catch(() => {});
      if (this.currentId === paperId) {
        this.currentMd = await store.loadMarkdown(paperId).catch(() => null);
      }
      this._patch(paperId, { state: 'done', stateText: '已完成', progress: 100, doneAt: Date.now() });
      await this.refresh();
      // key 变化触发 Viewer 重建：currentId null → paperId
      if (this.currentId === paperId) {
        this.currentId = null;
        this.currentMd = null;
        await new Promise((r) => setTimeout(r, 0));
        this.currentId = paperId;
        this.currentMd = await store.loadMarkdown(paperId).catch(() => null);
      }
    },

    async _extractZip(paperId, arrayBuffer) {
      const zip = await JSZip.loadAsync(arrayBuffer);
      let mdName = zip.files['full.md'] ? 'full.md' : Object.keys(zip.files).find((n) => /\.md$/i.test(n));
      for (const entry of Object.values(zip.files)) {
        if (entry.dir) continue;
        if (entry.name === mdName) {
          await store.saveMarkdown(paperId, await entry.async('string'));
        } else {
          await store.saveAsset(paperId, entry.name, await entry.async('blob'));
        }
      }
    },

    _patch(paperId, patch) {
      const m = this.papers.find((p) => p.id === paperId);
      if (!m) return;
      Object.assign(m, patch);
      store.saveMeta(paperId, m).catch(() => {});
    },

    _resumeUnfinished() {
      const pending = this.papers.filter((p) => p.batchId && !['done', 'failed'].includes(p.state));
      for (const p of pending) {
        this._patch(p.id, { stateText: '恢复进度跟踪...' });
        const token = localStorage.getItem('mineru_token') || '';
        if (token) this._resumeParsing(p.id, token).catch(() => {});
      }
    },

    async delete(paperId) {
      await store.deletePaper(paperId);
      const { useFoldersStore } = await import('./folders.js');
      await useFoldersStore().removePaper(paperId);
      delete this.noteTasks[paperId];
      if (this.currentId === paperId) { this.currentId = null; this.currentMd = null; }
      await this.refresh();
    },

    beginNoteGeneration(paperId, meta = {}) {
      this.noteTasks[paperId] = {
        generating: true,
        stream: '',
        error: '',
        noteId: meta.noteId || '',
        noteTitle: meta.noteTitle || '',
        templateId: meta.templateId || '',
        templateName: meta.templateName || '',
        updatedAt: Date.now(),
      };
    },

    appendNoteStream(paperId, chunk) {
      const task = this.noteTasks[paperId];
      if (!task?.generating) return;
      task.stream += chunk;
      task.updatedAt = Date.now();
    },

    finishNoteGeneration(paperId) {
      const task = this.noteTasks[paperId];
      if (!task) return;
      task.generating = false;
      task.stream = '';
      task.error = '';
      task.updatedAt = Date.now();
    },

    failNoteGeneration(paperId, message) {
      const task = this.noteTasks[paperId] || {};
      this.noteTasks[paperId] = {
        ...task,
        generating: false,
        stream: '',
        error: message || '生成失败',
        updatedAt: Date.now(),
      };
    },

    async updateRemark(paperId, remark) {
      const next = (remark || '').trim();
      this._patch(paperId, { remark: next || undefined });
    },

    async updateMetadata(paperId, metadata) {
      const paper = this.papers.find((p) => p.id === paperId);
      if (!paper) return null;
      const next = normalizeMetadata(metadata, paper.title || paper.fileName || '');
      this._patch(paperId, {
        metadata: next,
        title: next.title || paper.title,
      });
      return next;
    },

    async extractMetadata(paperId, options = {}) {
      const paper = this.papers.find((p) => p.id === paperId);
      if (!paper) return null;
      const md = await store.loadMarkdown(paperId);
      const metadata = extractMetadataFromMarkdown(md || '', paper.title || paper.fileName || '');
      const fileTitle = String(paper.fileName || '').replace(/\.pdf$/i, '');
      const shouldUpdateTitle = options.updateTitle && metadata.title
        && (!paper.title || paper.title === fileTitle);
      this._patch(paperId, {
        metadata,
        ...(shouldUpdateTitle ? { title: metadata.title } : {}),
      });
      return metadata;
    },

    async updateWorkflow(paperId, patch) {
      const paper = this.papers.find((p) => p.id === paperId);
      if (!paper) return null;
      const next = normalizeWorkflowFields({ ...paper, ...patch });
      this._patch(paperId, next);
      return next;
    },

    async updateTags(paperId, tags) {
      const next = normalizeTagNames(tags);
      this._patch(paperId, { tags: next });
      const { useTagsStore } = await import('./tags.js');
      await useTagsStore().ensureTags(next);
    },

    async removeTagFromPaper(paperId, tagName) {
      const key = String(tagName || '').trim().toLowerCase();
      if (!key) return;
      const paper = this.papers.find((p) => p.id === paperId);
      if (!paper) return;
      const next = normalizeTagNames(paper.tags).filter((tag) => tag.toLowerCase() !== key);
      this._patch(paperId, { tags: next });
    },

    async removeTagsFromPapers(paperIds, tagNames) {
      const ids = new Set(Array.isArray(paperIds) ? paperIds : []);
      const keys = new Set(normalizeTagNames(tagNames, 64).map((tag) => tag.toLowerCase()));
      if (!ids.size || !keys.size) return 0;
      let changed = 0;
      for (const paper of this.papers) {
        if (!ids.has(paper.id)) continue;
        const current = normalizeTagNames(paper.tags);
        const next = current.filter((tag) => !keys.has(tag.toLowerCase()));
        if (next.length === current.length) continue;
        changed += 1;
        this._patch(paper.id, { tags: next });
      }
      return changed;
    },
  },
});
