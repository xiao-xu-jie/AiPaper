import { defineStore } from 'pinia';
import * as store from '../lib/store.js';
import * as mineru from '../lib/mineru.js';
import JSZip from 'jszip';

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
      try { this.papers = await store.listPapers(); } catch { this.papers = []; }
      if (!this.currentId && this.papers.length) await this.open(this.papers[0].id);
      this._resumeUnfinished();
    },

    async open(id) {
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
        createdAt: Date.now(),
      };
      this.papers.unshift(meta);
      this.currentId = paperId;

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
      if (this.currentId === paperId) {
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
      if (this.currentId === paperId) { this.currentId = null; this.currentMd = null; }
      await this.refresh();
    },
  },
});
