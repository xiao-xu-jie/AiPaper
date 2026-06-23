import { defineStore } from 'pinia';
import { saveFolders, loadFolders, saveMeta } from '../lib/store.js';

function folderId() {
  return 'folder_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 5);
}

const DEFAULT_TREE = {
  root: { id: 'root', name: '全部论文', children: [], papers: [] },
};

export const useFoldersStore = defineStore('folders', {
  state: () => ({
    tree: { ...DEFAULT_TREE },
    expanded: { root: true }, // 用对象替代 Set，避免 Pinia 响应式问题
    activeFolderId: 'root',
  }),

  getters: {
    folder: (s) => (id) => s.tree[id],
  },

  actions: {
    async init(papers) {
      const saved = await loadFolders();
      if (saved) {
        // 用 Object.assign 保留响应式引用，避免整体替换丢失追踪
        Object.assign(this.tree, saved);
        // 删除 saved 中没有的旧 key
        for (const k of Object.keys(this.tree)) {
          if (!(k in saved)) delete this.tree[k];
        }
        if (!this.tree.root) Object.assign(this.tree, DEFAULT_TREE);
      } else {
        const rootPapers = papers.map((p) => p.id);
        this.tree.root = { id: 'root', name: '全部论文', children: [], papers: rootPapers };
        await this._persist();
      }
    },

    toggle(id) {
      this.expanded[id] = !this.expanded[id];
    },

    async createFolder(parentId, name) {
      const id = folderId();
      this.tree[id] = { id, name, children: [], papers: [] };
      this.tree[parentId].children.push(id);
      this.expanded[parentId] = true;
      await this._persist();
      return id;
    },

    async renameFolder(id, name) {
      if (!this.tree[id] || id === 'root') return;
      this.tree[id].name = name;
      await this._persist();
    },

    async deleteFolder(id) {
      if (!this.tree[id] || id === 'root') return;
      // 递归收集所有子目录和论文，统一移到 root
      const collect = (fid) => {
        const f = this.tree[fid];
        if (!f) return;
        f.papers.forEach((pid) => {
          if (!this.tree.root.papers.includes(pid)) this.tree.root.papers.push(pid);
        });
        f.children.forEach(collect);
        delete this.tree[fid];
      };
      collect(id);
      // 从父目录移除
      for (const f of Object.values(this.tree)) {
        f.children = f.children.filter((c) => c !== id);
      }
      if (this.activeFolderId === id) this.activeFolderId = 'root';
      await this._persist();
    },

    async movePaper(paperId, targetFolderId) {
      // 从所有目录移除
      for (const f of Object.values(this.tree)) {
        f.papers = f.papers.filter((p) => p !== paperId);
      }
      this.tree[targetFolderId].papers.push(paperId);
      await this._persist();
    },

    // 判断目录是否为另一目录的祖先（避免拖入自身或子目录形成环）
    isAncestor(ancestorId, descendantId) {
      let cur = this.getParentFolder(descendantId);
      while (cur) {
        if (cur === ancestorId) return true;
        cur = this.getParentFolder(cur);
      }
      return false;
    },

    getParentFolder(id) {
      for (const [pid, folder] of Object.entries(this.tree)) {
        if ((folder.children || []).includes(id)) return pid;
      }
      return null;
    },

    async moveFolder(folderId, targetParentId) {
      if (!this.tree[folderId] || folderId === 'root') return false;
      if (!this.tree[targetParentId]) return false;
      if (folderId === targetParentId) return false;
      if (this.isAncestor(folderId, targetParentId)) return false;
      const oldParent = this.getParentFolder(folderId);
      if (oldParent === targetParentId) return false;
      if (oldParent) {
        this.tree[oldParent].children = this.tree[oldParent].children.filter((c) => c !== folderId);
      }
      if (!this.tree[targetParentId].children.includes(folderId)) {
        this.tree[targetParentId].children.push(folderId);
      }
      this.expanded[targetParentId] = true;
      await this._persist();
      return true;
    },

    async addPaper(paperId, folderId) {
      const target = folderId || this.activeFolderId || 'root';
      if (!this.tree[target]) return;
      if (!this.tree[target].papers.includes(paperId)) {
        this.tree[target].papers.push(paperId);
      }
      await this._persist();
    },

    async removePaper(paperId) {
      for (const f of Object.values(this.tree)) {
        f.papers = f.papers.filter((p) => p !== paperId);
      }
      await this._persist();
    },

    // 获取论文所在目录
    getPaperFolder(paperId) {
      return Object.values(this.tree).find((f) => f.papers.includes(paperId))?.id || 'root';
    },

    async _persist() {
      await saveFolders(this.tree).catch(() => {});
    },
  },
});
