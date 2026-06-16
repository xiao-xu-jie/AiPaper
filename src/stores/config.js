import { defineStore } from 'pinia';
import * as mineru from '../lib/mineru.js';
import * as agent from '../lib/agent.js';

export const useConfigStore = defineStore('config', {
  state: () => ({
    token: localStorage.getItem('mineru_token') || '',
    model: localStorage.getItem('mineru_model') || 'vlm',
    lang: localStorage.getItem('mineru_lang') || 'ch',
    proxy: localStorage.getItem('mineru_proxy') || '',
    aiUrl: localStorage.getItem('ai_url') || '',
    aiModel: localStorage.getItem('ai_model') || '',
    aiKey: localStorage.getItem('ai_key') || '',
  }),
  actions: {
    init() {
      mineru.setProxy(this.proxy);
      agent.configure(this.aiUrl, this.aiModel, this.aiKey);
    },
    save() {
      localStorage.setItem('mineru_token', this.token);
      localStorage.setItem('mineru_model', this.model);
      localStorage.setItem('mineru_lang', this.lang);
      localStorage.setItem('mineru_proxy', this.proxy);
      localStorage.setItem('ai_url', this.aiUrl);
      localStorage.setItem('ai_model', this.aiModel);
      localStorage.setItem('ai_key', this.aiKey);
      mineru.setProxy(this.proxy);
      agent.configure(this.aiUrl, this.aiModel, this.aiKey);
    },
  },
});
