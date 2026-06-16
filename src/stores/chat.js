import { defineStore } from 'pinia';
import * as store from '../lib/store.js';
import * as agent from '../lib/agent.js';

function chatId() {
  return 'chat_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 5);
}

export const useChatStore = defineStore('chat', {
  state: () => ({
    session: null,       // { id, title, messages[], createdAt, updatedAt }
    sessions: [],        // all sessions for current paper
    paperId: null,
    busy: false,
    showPicker: false,
  }),

  actions: {
    async loadForPaper(paperId) {
      this.paperId = paperId;
      this.sessions = await store.listChats(paperId);
      if (this.sessions.length === 0) {
        this._newSession();
      } else {
        this.showPicker = true;
      }
    },

    _newSession(allSessions) {
      const n = (allSessions ?? this.sessions).length + 1;
      this.session = { id: chatId(), title: `对话 ${n}`, messages: [], createdAt: Date.now(), updatedAt: Date.now() };
      this.showPicker = false;
      this._persist();
    },

    async newSession() {
      const all = await store.listChats(this.paperId);
      this._newSession(all);
      this.sessions = await store.listChats(this.paperId);
    },

    selectSession(s) {
      this.session = { ...s };
      this.showPicker = false;
    },

    async deleteSession(id) {
      await store.deleteChat(this.paperId, id);
      this.sessions = await store.listChats(this.paperId);
      if (!this.sessions.length) { this._newSession([]); }
      else if (this.session?.id === id) { this.selectSession(this.sessions[0]); }
    },

    async openPicker() {
      this.sessions = await store.listChats(this.paperId);
      this.showPicker = true;
    },

    renameSession(title) {
      if (!this.session) return;
      this.session.title = title;
      this._persist();
    },

    async send(userMsg, images, onChunk) {
      if (this.busy || !this.session) return;
      this.busy = true;

      const userContent = images.length
        ? [{ type: 'text', text: userMsg || ' ' }, ...images.map((b64) => ({ type: 'image_url', image_url: { url: b64 } }))]
        : userMsg;
      this.session.messages.push({ role: 'user', content: userContent });

      let reply = '';
      try {
        const history = this.session.messages.slice(0, -1);
        reply = await agent.chat(history, userMsg, images, onChunk);
        this.session.messages.push({ role: 'assistant', content: reply });
        this._persist();
      } catch (e) {
        this.session.messages.pop();
        throw e;
      } finally {
        this.busy = false;
      }
      return reply;
    },

    _persist() {
      if (!this.paperId || !this.session) return;
      this.session.updatedAt = Date.now();
      store.saveChat(this.paperId, { ...this.session }).catch(() => {});
    },
  },
});
