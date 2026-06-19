import { defineStore } from 'pinia';
import { loadTags, saveTags } from '../lib/store.js';

const MAX_TAG_LEN = 16;
const MAX_PAPER_TAGS = 8;

function tagId() {
  return 'tag_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
}

export function normalizeTagName(name) {
  return String(name || '').replace(/\s+/g, ' ').trim().slice(0, MAX_TAG_LEN);
}

export function normalizeTagNames(names, limit = MAX_PAPER_TAGS) {
  const out = [];
  const seen = new Set();
  for (const raw of Array.isArray(names) ? names : []) {
    const name = normalizeTagName(raw);
    const key = name.toLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    out.push(name);
    if (out.length >= limit) break;
  }
  return out;
}

function hasTag(paper, tagName) {
  const key = normalizeTagName(tagName).toLowerCase();
  return (paper?.tags || []).some((t) => normalizeTagName(t).toLowerCase() === key);
}

export const useTagsStore = defineStore('tags', {
  state: () => ({
    tags: [],
    activeTagNames: [],
  }),

  getters: {
    tagNames: (s) => s.tags.map((t) => t.name),
    activeTagSet: (s) => new Set(s.activeTagNames.map((t) => t.toLowerCase())),
    usageCount: () => (name, papers = []) => papers.filter((p) => hasTag(p, name)).length,
  },

  actions: {
    async init(papers = []) {
      const saved = await loadTags();
      const map = new Map();
      const add = (item) => {
        const rawName = typeof item === 'string' ? item : item?.name;
        const name = normalizeTagName(rawName);
        if (!name) return;
        const key = name.toLowerCase();
        if (!map.has(key)) {
          map.set(key, {
            id: typeof item === 'object' && item?.id ? item.id : tagId(),
            name,
            createdAt: typeof item === 'object' && item?.createdAt ? item.createdAt : Date.now(),
          });
        }
      };

      (Array.isArray(saved?.tags) ? saved.tags : []).forEach(add);
      papers.forEach((paper) => normalizeTagNames(paper.tags, MAX_PAPER_TAGS).forEach(add));

      const next = [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'));
      this.tags.splice(0, this.tags.length, ...next);
      this.activeTagNames = normalizeTagNames(this.activeTagNames, 64)
        .filter((name) => this.tags.some((tag) => tag.name.toLowerCase() === name.toLowerCase()));
      await this.persist();
    },

    async ensureTags(names) {
      const normalized = normalizeTagNames(names, 64);
      let changed = false;
      for (const name of normalized) {
        if (this.tags.some((t) => t.name.toLowerCase() === name.toLowerCase())) continue;
        this.tags.push({ id: tagId(), name, createdAt: Date.now() });
        changed = true;
      }
      if (changed) {
        this.tags.sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'));
        await this.persist();
      }
      return normalized;
    },

    async deleteLibraryTag(name, papers = []) {
      const normalized = normalizeTagName(name);
      if (!normalized) return { ok: false, count: 0 };
      const count = this.usageCount(normalized, papers);
      if (count > 0) return { ok: false, count };
      const before = this.tags.length;
      this.tags = this.tags.filter((t) => t.name.toLowerCase() !== normalized.toLowerCase());
      this.activeTagNames = this.activeTagNames.filter((t) => t.toLowerCase() !== normalized.toLowerCase());
      if (this.tags.length !== before) await this.persist();
      return { ok: true, count: 0 };
    },

    toggleFilterTag(name) {
      const normalized = normalizeTagName(name);
      if (!normalized) return;
      const idx = this.activeTagNames.findIndex((t) => t.toLowerCase() === normalized.toLowerCase());
      if (idx >= 0) this.activeTagNames.splice(idx, 1);
      else this.activeTagNames.push(normalized);
    },

    clearFilters() {
      this.activeTagNames = [];
    },

    async persist() {
      await saveTags({ tags: this.tags }).catch(() => {});
    },
  },
});
