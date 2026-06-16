import { defineStore } from 'pinia';
import * as mineru from '../lib/mineru.js';
import * as agent from '../lib/agent.js';

const DEFAULT_NOTE_TEMPLATE = `# {{title}}

## 基本信息
- **作者**：
- **期刊/会议**：
- **年份**：
- **链接**：

## 研究问题

## 主要方法

## 核心结论

## 优缺点分析
### 优点

### 不足

## 个人思考与启发
`;

export const useConfigStore = defineStore('config', {
  state: () => ({
    token: localStorage.getItem('mineru_token') || '',
    model: localStorage.getItem('mineru_model') || 'vlm',
    lang: localStorage.getItem('mineru_lang') || 'ch',
    proxy: localStorage.getItem('mineru_proxy') || '',
    aiUrl: localStorage.getItem('ai_url') || '',
    aiModel: localStorage.getItem('ai_model') || '',
    aiKey: localStorage.getItem('ai_key') || '',
    noteTemplate: localStorage.getItem('note_template') || DEFAULT_NOTE_TEMPLATE,
  }),
  actions: {
    init() {
      // 网页端：若未手动配置代理，自动使用同源代理前缀
      if (!this.proxy && typeof window !== 'undefined' && window.location.hostname === 'localhost') {
        const autoProxy = `${window.location.origin}/proxy?url=`;
        mineru.setProxy(autoProxy);
      } else {
        mineru.setProxy(this.proxy);
      }
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
      localStorage.setItem('note_template', this.noteTemplate);
      const effectiveProxy = this.proxy || (window.location.hostname === 'localhost' ? `${window.location.origin}/proxy?url=` : '');
      mineru.setProxy(effectiveProxy);
      agent.configure(this.aiUrl, this.aiModel, this.aiKey);
    },
  },
});
