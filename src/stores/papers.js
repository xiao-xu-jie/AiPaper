import { defineStore } from 'pinia';
import * as store from '../lib/store.js';
import * as mineru from '../lib/mineru.js';
import JSZip from 'jszip';
import { normalizeTagNames } from './tags.js';

function uid() {
  return 'p_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
}

export const usePapersStore = defineStore('papers', {
  state: () => ({
    papers: [],
    currentId: null,
    currentMd: null,
    noteGenerating: false,
    noteStream: '',
    noteResult: null,
    noteGeneratingFor: null, // 正在为哪篇论文生成
  }),
  getters: {
    currentPaper: (s) => s.papers.find((p) => p.id === s.currentId) || null,
  },
  actions: {
    async refresh() {
      let list = [];
      try { list = await store.listPapers(); } catch { list = []; }
      list = list.map((p) => ({
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
      this.currentMd = md;
    },

    async upload(files, cfg) {
      for (const file of files) await this._processOne(file, cfg);
    },

    async _processOne(file, cfg) {
      const paperId = uid();
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
      };
      this.papers.unshift(meta);
      this.currentId = paperId;

      // 加入当前目录
      const { useFoldersStore } = await import('./folders.js');
      await useFoldersStore().addPaper(paperId);

      try {
        await store.savePdf(paperId, file);
        await store.saveMeta(paperId, meta);

        this._patch(paperId, { stateText: '申请上传链接...' });
        const { batchId, fileUrls } = await mineru.applyUpload(
          cfg.token,
          [{ name: file.name, data_id: paperId }],
          { model_version: cfg.model, language: cfg.lang },
        );
        this._patch(paperId, { batchId });

        this._patch(paperId, { stateText: '上传中...' });
        await mineru.uploadFile(fileUrls[0], file, (p) => {
          this._patch(paperId, { progress: Math.round(p * 100), stateText: `上传中 ${Math.round(p * 100)}%` });
        });

        this._patch(paperId, { state: 'running', stateText: '已提交，等待解析...', progress: 0 });
        await this._resumeParsing(paperId, cfg.token);
      } catch (err) {
        this._patch(paperId, { state: 'failed', stateText: err.message, error: err.message });
        throw err;
      }
    },

    async _resumeParsing(paperId, token) {
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
          },
        },
      );
      this._patch(paperId, { stateText: '下载结果...' });
      const buf = await mineru.downloadZip(result.full_zip_url);
      await this._extractZip(paperId, buf);
      this._patch(paperId, { state: 'done', stateText: '已完成', progress: 100, doneAt: Date.now() });
      await this.refresh();
      // key 变化触发 Viewer 重建：currentId null → paperId
      if (this.currentId === paperId) {
        this.currentId = null;
        await new Promise((r) => setTimeout(r, 0));
        this.currentId = paperId;
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
      if (this.currentId === paperId) { this.currentId = null; this.currentMd = null; }
      await this.refresh();
    },

    async updateRemark(paperId, remark) {
      const next = (remark || '').trim();
      this._patch(paperId, { remark: next || undefined });
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
