import { defineStore } from 'pinia';
import * as store from '../lib/store.js';
import * as agent from '../lib/agent.js';

function chatId() {
  return 'chat_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 5);
}

function getMessageText(msg) {
  return Array.isArray(msg?.content)
    ? msg.content.find((c) => c.type === 'text')?.text || ''
    : String(msg?.content || '');
}

function getMessageImages(msg) {
  return Array.isArray(msg?.content)
    ? msg.content.filter((c) => c.type === 'image_url').map((c) => c.image_url?.url).filter(Boolean)
    : [];
}

function resultContent(result) {
  return typeof result === 'string' ? result : (result?.content || '');
}

function resultMeta(result, patch = {}) {
  if (!result || typeof result === 'string') return patch;
  return {
    model: result.model,
    providerUrl: result.providerUrl,
    durationMs: result.durationMs,
    usage: result.usage,
    ...patch,
  };
}

export const useChatStore = defineStore('chat', {
  state: () => ({
    session: null,       // { id, title, messages[], createdAt, updatedAt }
    sessions: [],        // all sessions for current paper
    paperId: null,
    busy: false,
    showPicker: false,
    abortController: null,
    activeStartedAt: 0,
  }),

  actions: {
    async loadForPaper(paperId) {
      this.paperId = paperId;
      this.sessions = await store.listChats(paperId);
      if (this.sessions.length === 0) {
        this._newSession();
        return false; // 无需选择，直接打开
      } else {
        this.showPicker = true;
        return true;  // 需要等用户选择
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

    async send(userMsg, images, onChunk, options = {}) {
      if (this.busy || !this.session) return;
      const userContent = images.length
        ? [{ type: 'text', text: userMsg || ' ' }, ...images.map((b64) => ({ type: 'image_url', image_url: { url: b64 } }))]
        : userMsg;
      this.session.messages.push({
        role: 'user',
        content: userContent,
        meta: {
          createdAt: Date.now(),
          refIds: options.refIds || [],
        },
      });
      return this._sendAssistantForUser(this.session.messages.length - 1, onChunk, options);
    },

    async regenerateLast(onChunk, options = {}) {
      if (this.busy || !this.session?.messages?.length) return;
      const messages = this.session.messages;
      let assistantIndex = messages.length - 1;
      while (assistantIndex >= 0 && messages[assistantIndex].role !== 'assistant') assistantIndex -= 1;
      if (assistantIndex < 0) return;
      let userIndex = assistantIndex - 1;
      while (userIndex >= 0 && messages[userIndex].role !== 'user') userIndex -= 1;
      if (userIndex < 0) return;
      messages.splice(assistantIndex, messages.length - assistantIndex);
      return this._sendAssistantForUser(userIndex, onChunk, options);
    },

    cancelCurrent() {
      this.abortController?.abort();
    },

    async _sendAssistantForUser(userIndex, onChunk, options = {}) {
      if (this.busy || !this.session) return;
      this.busy = true;
      this.activeStartedAt = Date.now();
      this.abortController = new AbortController();
      let reply = '';
      try {
        const user = this.session.messages[userIndex];
        const history = this.session.messages.slice(0, userIndex);
        const userMsg = getMessageText(user);
        const images = getMessageImages(user);
        const result = await agent.chat(history, userMsg, images, (chunk) => {
          reply += chunk;
          onChunk?.(chunk);
        }, { ...options, signal: this.abortController.signal });
        const content = resultContent(result);
        this.session.messages.push({
          role: 'assistant',
          content,
          meta: resultMeta(result, {
            createdAt: Date.now(),
            refIds: options.refIds || user.meta?.refIds || [],
          }),
        });
        this._persist();
        return content;
      } catch (e) {
        const aborted = agent.isAbortError(e);
        const content = aborted
          ? (reply.trim() ? `${reply}\n\n[已取消]` : '[已取消]')
          : `[错误] ${e.message}`;
        this.session.messages.push({
          role: 'assistant',
          content,
          meta: {
            createdAt: Date.now(),
            durationMs: Date.now() - this.activeStartedAt,
            model: agent.getCurrentConfig().model,
            canceled: aborted,
            error: aborted ? '' : e.message,
          },
        });
        this._persist();
        if (aborted) return reply;
        throw e;
      } finally {
        this.busy = false;
        this.abortController = null;
        this.activeStartedAt = 0;
      }
    },

    _persist() {
      if (!this.paperId || !this.session) return;
      this.session.updatedAt = Date.now();
      store.saveChat(this.paperId, { ...this.session }).catch(() => {});
    },
  },
});
