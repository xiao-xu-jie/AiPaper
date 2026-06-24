import { defineStore } from 'pinia';
import * as mineru from '../lib/mineru.js';
import * as agent from '../lib/agent.js';

// 非 Electron 环境（网页模式）自动使用同源代理
function autoProxyPrefix() {
  if (typeof window === 'undefined') return '';
  // Electron：file:// 协议（生产）或含 Electron 的 userAgent（开发）
  if (window.location.protocol === 'file:') return '';
  if (navigator.userAgent.includes('Electron')) return '';
  return `${window.location.origin}/proxy?url=`;
}

const LOCAL_BUILTIN_PROVIDERS = [
  {
    id: 'opencode-zen',
    name: 'OpenCode Zen (Free)',
    baseUrl: 'https://opencode.ai/zen/v1',
    apiKey: '',
    builtin: true,
    models: [
      { id: 'deepseek-v4-flash-free', name: 'DeepSeek V4 Flash' },
      { id: 'mimo-v2.5-free', name: 'MimoV2.5' },
      { id: 'nemotron-3-ultra-free', name: 'Nemotron 3 Ultra' },
      { id: 'nemotron-3-super-free', name: 'Nemotron 3 Super' },
    ],
  },
  {
    id: 'kilo',
    name: 'Kilo (Free Router)',
    baseUrl: 'https://api.kilo.ai/api/gateway',
    apiKey: '',
    builtin: true,
    models: [{ id: 'kilo-auto/free', name: 'Kilo Auto (Free Router)' }],
  },
];

function cloneProvider(provider) {
  return {
    ...provider,
    models: [...(provider.models || [])],
    customModels: [...(provider.customModels || [])],
  };
}

function mergeBuiltinProviders(existingProviders, remoteProviders = []) {
  const existingById = new Map(existingProviders.map((provider) => [provider.id, provider]));
  const builtinsById = new Map();

  for (const provider of LOCAL_BUILTIN_PROVIDERS) {
    builtinsById.set(provider.id, cloneProvider(provider));
  }

  for (const provider of remoteProviders) {
    if (!provider?.id) continue;
    builtinsById.set(provider.id, { ...cloneProvider(provider), builtin: true });
  }

  const builtins = [...builtinsById.values()].map((provider) => {
    const existing = existingById.get(provider.id);
    if (!existing) return provider;
    return {
      ...provider,
      apiKey: existing.apiKey || provider.apiKey || '',
      customModels: existing.customModels || [],
    };
  });

  const custom = existingProviders.filter((provider) => !provider.builtin);
  return [...builtins, ...custom];
}

const DEFAULT_NOTE_TEMPLATE = `# 论文阅读笔记：{{title}}

> 📅 笔记日期：YYYY-MM-DD
> 📂 来源：[论文文件名 / 链接]
> ⏱ 预计阅读时间：X 分钟
> 🎯 阅读目的：[为什么读这篇 / 用在什么场景]

---

## 0. 速览卡 (TL;DR)

| 维度 | 内容 |
|---|---|
| **论文标题** |  |
| **作者 / 机构** |  |
| **发表 venue / 年份** |  |
| **关键词** |  |
| **研究问题** | 一句话说清楚论文要解决什么问题 |
| **核心方法** | 一句话讲清楚用了什么方法 |
| **主要结果** | 一句话给出最重要的实验/结论 |
| **关键插图** | 哪张图最能代表整篇论文（Fig. X） |
| **我的评价** | ⭐⭐⭐⭐⭐ （价值、创新、严谨度） |

【填写说明】先花 5 分钟通读摘要 + 结论 + 图表，填完这张卡，作为整篇笔记的"锚点"。

---

## 1. 论文基本信息

### 1.1 元信息
- **完整标题**：
- **作者**（全部，按顺序）：
- **机构 / 通讯作者**：
- **发表期刊 / 会议**：
- **发表年份 / 卷期 / 页码**：
- **DOI / arXiv**：
- **代码仓库**（如有）：

### 1.2 摘要原文摘录
> （复制摘要原文，方便回溯）

### 1.3 关键词
- 关键词 1、2、3 …

【填写说明】这部分是机器可检索字段，方便后续用关键词反查。

---

## 2. 研究背景与动机

### 2.1 大背景
- 所属领域：
- 时代背景 / 技术趋势：

### 2.2 具体痛点
- 现有方法存在哪些问题？（分点列出）
  1. 局限 1
  2. 局限 2
  3. …

### 2.3 本文要解决的核心问题
- 用一句话陈述：
- 该问题的难点 / 为什么之前没人做好：

### 2.4 相关工作脉络（作者视角）
| 工作 | 主要思路 | 优点 | 不足 |
|---|---|---|---|
| [作者][ref] |  |  |  |
| [作者][ref] |  |  |  |

【填写说明】作者在 Introduction / Related Work 里往往按"已有方法→不足→本文切入点"组织，复述这条线索即可。

---

## 3. 核心方法

### 3.1 总体框架

#### 🖼 Fig. X：XXX（**关键插图 / 代表论文**）
- **图号 & 标题**：
- **图的位置（章节）**：
- **图的作用**：
- **图的结构拆解**（自上而下 / 自左而右）：
  - 区域 1：包含哪些组件
  - 区域 2：包含哪些组件
  - …
- **关键箭头 / 数据流**：
- **该图想传达的核心思想**（一句话）：
- **为什么这是关键插图**：
  - 一张图覆盖几个核心贡献？
  - 是否被作者反复引用？
  - 是否对应论文标题 / 摘要关键词？
- **我的理解** / 疑点：

#### 框架总览（用自己的话重画）
`;

const DEFAULT_NOTE_PROMPT = '生成一份结构完整、信息密度高的论文阅读笔记；优先提取论文原文中的事实，不确定的内容请标注“待确认”。';

const BUILTIN_NOTE_TEMPLATES = [
  {
    id: 'quick-reading',
    name: '快速阅读模板',
    description: '适合 10-20 分钟判断论文是否值得精读。',
    prompt: '重点输出研究问题、核心方法、主要结论、是否值得继续读，保持简洁可扫读。',
    content: `# 快速阅读：{{title}}

> 日期：{{date}}
> 文件：{{fileName}}

## 1. 一句话结论
- 这篇论文主要解决：
- 最重要的想法：
- 我是否需要继续精读：

## 2. 速览卡
| 维度 | 内容 |
|---|---|
| 领域 / 任务 |  |
| 核心方法 |  |
| 关键结果 |  |
| 代码 / 数据 |  |
| 适用场景 |  |
| 风险或不足 |  |

## 3. 关键图表
- Fig. X：
- Table X：

## 4. 可复用点
- 可借鉴的方法：
- 可借鉴的实验：
- 可引用的观点：

## 5. 下一步
- [ ] 精读方法
- [ ] 检查实验细节
- [ ] 找相关代码或数据
`,
  },
  {
    id: 'deep-reading',
    name: '精读模板',
    description: '适合系统拆解背景、方法、实验和个人评价。',
    prompt: DEFAULT_NOTE_PROMPT,
    content: DEFAULT_NOTE_TEMPLATE,
  },
  {
    id: 'survey',
    name: '综述模板',
    description: '适合把论文放进领域脉络中比较。',
    prompt: '按综述视角组织内容，突出问题谱系、方法分类、代表工作、优缺点对比和未来趋势。',
    content: `# 综述笔记：{{title}}

> 日期：{{date}}
> 主题标签：{{tags}}

## 1. 论文定位
- 所属领域：
- 研究对象：
- 与已有方向的关系：
- 适合放入综述的章节：

## 2. 问题脉络
| 问题 | 代表方法 | 本文位置 |
|---|---|---|
|  |  |  |

## 3. 方法分类
### 3.1 本文方法类别
- 分类依据：
- 关键假设：
- 与同类方法差异：

### 3.2 可比较工作
| 工作 | 方法思路 | 优点 | 局限 | 与本文关系 |
|---|---|---|---|---|
|  |  |  |  |  |

## 4. 证据与结论
- 作者用哪些实验支撑结论：
- 哪些证据最强：
- 哪些证据仍不足：

## 5. 综述可用表述
- 可引用的一句话：
- 可归纳的趋势：
- 可提出的开放问题：
`,
  },
  {
    id: 'reproduce-experiment',
    name: '复现实验模板',
    description: '适合记录复现实验所需条件、步骤和风险。',
    prompt: '从复现实验角度提取信息，优先关注环境、数据、训练/推理流程、指标、超参数和复现风险。',
    content: `# 复现实验笔记：{{title}}

> 日期：{{date}}
> 目标：复现核心实验 / 复现关键结果 / 改造到自己的任务

## 1. 复现目标
- 要复现的表格 / 图：
- 成功标准：
- 最小可行复现范围：

## 2. 资源清单
| 资源 | 状态 | 备注 |
|---|---|---|
| 代码仓库 |  |  |
| 数据集 |  |  |
| 模型权重 |  |  |
| 配置文件 |  |  |

## 3. 环境与依赖
- Python / CUDA / 框架版本：
- 关键依赖：
- 硬件需求：

## 4. 实验流程
1. 数据准备：
2. 训练或推理：
3. 评估：
4. 结果汇总：

## 5. 关键参数
| 参数 | 论文值 | 计划值 | 影响 |
|---|---|---|---|
|  |  |  |  |

## 6. 风险与替代方案
- 可能卡住的点：
- 降级复现方案：
- 需要联系作者的问题：
`,
  },
  {
    id: 'group-meeting',
    name: '组会汇报模板',
    description: '适合整理成 5-15 分钟汇报提纲。',
    prompt: '生成面向组会汇报的笔记，突出讲述顺序、听众能快速理解的背景、核心图表和讨论问题。',
    content: `# 组会汇报：{{title}}

> 日期：{{date}}
> 汇报时长：10 分钟

## 1. 开场
- 这篇论文解决什么问题：
- 为什么值得讲：
- 听众需要先知道的背景：

## 2. 三句话讲清楚
1. 背景：
2. 方法：
3. 结果：

## 3. 汇报结构
| 页码 | 标题 | 讲述重点 | 配图 |
|---|---|---|---|
| 1 | 背景与动机 |  |  |
| 2 | 方法框架 |  |  |
| 3 | 实验结果 |  |  |
| 4 | 评价与讨论 |  |  |

## 4. 必讲图表
- Fig. X：
- Table X：

## 5. 讨论问题
- 我不确定的点：
- 可以和组内工作结合的点：
- 值得延伸的问题：
`,
  },
  {
    id: 'method-breakdown',
    name: '方法拆解模板',
    description: '适合把论文方法拆成模块、输入输出和训练目标。',
    prompt: '专注拆解方法结构，明确每个模块的输入、输出、目标函数、训练方式、推理流程和设计取舍。',
    content: `# 方法拆解：{{title}}

> 日期：{{date}}

## 1. 方法总览
- 方法名称：
- 输入：
- 输出：
- 核心假设：
- 主要创新：

## 2. 模块拆解
| 模块 | 输入 | 输出 | 作用 | 可替换性 |
|---|---|---|---|---|
|  |  |  |  |  |

## 3. 数据流
1. 数据进入：
2. 表征构建：
3. 中间推理：
4. 结果输出：

## 4. 训练目标
- Loss / Objective：
- 监督信号：
- 负样本或约束：
- 训练技巧：

## 5. 推理流程
- 推理步骤：
- 时间 / 显存复杂度：
- 部署限制：

## 6. 设计取舍
- 为什么这样设计：
- 替代方案是什么：
- 哪些模块最关键：
`,
  },
  {
    id: 'code-reproduction-plan',
    name: '代码复现计划模板',
    description: '适合把论文转成可执行的开发任务。',
    prompt: '把论文内容转成工程计划，输出目录结构、模块任务、接口、测试样例、里程碑和风险。',
    content: `# 代码复现计划：{{title}}

> 日期：{{date}}
> 目标仓库 / 项目：

## 1. 最小可行目标
- 第一阶段要跑通：
- 暂不实现：
- 验收标准：

## 2. 项目结构草案
| 路径 / 模块 | 作用 | 优先级 |
|---|---|---|
|  |  |  |

## 3. 核心接口
| 接口 | 输入 | 输出 | 说明 |
|---|---|---|---|
|  |  |  |  |

## 4. 实现任务
- [ ] 数据加载
- [ ] 模型 / 算法主体
- [ ] 训练或推理脚本
- [ ] 评估指标
- [ ] 配置与日志
- [ ] 示例与文档

## 5. 测试计划
- 单元测试：
- 小样本冒烟测试：
- 与论文结果对齐：

## 6. 里程碑与风险
| 阶段 | 目标 | 风险 |
|---|---|---|
| Day 1 |  |  |
| Day 2-3 |  |  |
| Week 1 |  |  |
`,
  },
];

function cloneNoteTemplate(template) {
  return {
    id: template.id,
    name: template.name || '未命名模板',
    description: template.description || '',
    prompt: template.prompt || DEFAULT_NOTE_PROMPT,
    content: template.content || DEFAULT_NOTE_TEMPLATE,
    builtin: Boolean(template.builtin),
  };
}

function withBuiltinFlag(template) {
  return cloneNoteTemplate({ ...template, builtin: true });
}

function parseJsonArray(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizeNoteTemplates(savedTemplates, legacyTemplate, migrateLegacy = false) {
  const builtins = BUILTIN_NOTE_TEMPLATES.map(withBuiltinFlag);
  const byId = new Map(builtins.map((template) => [template.id, template]));

  for (const template of savedTemplates) {
    if (!template?.id) continue;
    byId.set(template.id, cloneNoteTemplate(template));
  }

  const templates = [...byId.values()];
  const hasLegacy = migrateLegacy
    && typeof legacyTemplate === 'string'
    && legacyTemplate.trim()
    && legacyTemplate !== DEFAULT_NOTE_TEMPLATE;
  const hasLegacyTemplate = templates.some((template) => template.id === 'legacy-custom');
  if (hasLegacy && !hasLegacyTemplate) {
    templates.unshift({
      id: 'legacy-custom',
      name: '旧版自定义模板',
      description: '从旧版单模板配置迁移而来。',
      prompt: DEFAULT_NOTE_PROMPT,
      content: legacyTemplate,
      builtin: false,
    });
  }
  return templates.length ? templates : builtins;
}

function loadNoteTemplates() {
  const saved = parseJsonArray(localStorage.getItem('note_templates'));
  return normalizeNoteTemplates(
    saved,
    localStorage.getItem('note_template'),
    saved.length === 0
  );
}

function loadActiveNoteTemplateId() {
  const savedActive = localStorage.getItem('active_note_template_id');
  if (savedActive) return savedActive;
  const saved = parseJsonArray(localStorage.getItem('note_templates'));
  if (saved[0]?.id) return saved[0].id;
  const legacy = localStorage.getItem('note_template');
  return legacy && legacy !== DEFAULT_NOTE_TEMPLATE ? 'legacy-custom' : 'deep-reading';
}

export const useConfigStore = defineStore('config', {
  state: () => ({
    token: localStorage.getItem('mineru_token') || '',
    model: localStorage.getItem('mineru_model') || 'vlm',
    lang: localStorage.getItem('mineru_lang') || 'ch',
    noteTemplate: localStorage.getItem('note_template') || DEFAULT_NOTE_TEMPLATE,
    noteTemplates: loadNoteTemplates(),
    activeNoteTemplateId: loadActiveNoteTemplateId(),
    providers: JSON.parse(localStorage.getItem('ai_providers') || '[]'),
    currentProviderId: localStorage.getItem('ai_current_provider') || '',
    aiModel: localStorage.getItem('ai_model') || '',
  }),
  getters: {
    currentProvider(state) {
      return state.providers.find((p) => p.id === state.currentProviderId) || null;
    },
    aiUrl(state) {
      const p = state.providers.find((p) => p.id === state.currentProviderId);
      return p?.baseUrl || '';
    },
    aiKey(state) {
      const p = state.providers.find((p) => p.id === state.currentProviderId);
      return p?.apiKey || '';
    },
    currentModels(state) {
      const p = state.providers.find((p) => p.id === state.currentProviderId);
      if (!p) return [];
      return [...(p.models || []), ...(p.customModels || [])];
    },
    currentNoteTemplate(state) {
      return state.noteTemplates.find((template) => template.id === state.activeNoteTemplateId)
        || state.noteTemplates[0]
        || withBuiltinFlag(BUILTIN_NOTE_TEMPLATES[0]);
    },
  },
  actions: {
    async init() {
      const effectiveProxy = autoProxyPrefix();
      mineru.setProxy(effectiveProxy);
      this.providers = mergeBuiltinProviders(this.providers);
      await this.loadBuiltinProviders();
      if (!this.currentProviderId && this.providers.length) {
        this.currentProviderId = this.providers[0].id;
      }
      this.ensureNoteTemplates();
      this._applyAgent();
    },

    // 从 /api/providers 拉取预设提供商,合并到 providers(保留用户的 customModels 和自定义 provider)
    // Electron 用公网 aipaper.chat,网页版用同源 /api/providers(经 proxy)
    async loadBuiltinProviders() {
      let remoteProviders = [];
      try {
        const isElectron = window.location.protocol === 'file:' || navigator.userAgent.includes('Electron');
        const fetchUrl = isElectron ? 'https://aipaper.chat/api/providers' : '/api/providers';
        const res = await fetch(fetchUrl);
        const data = await res.json();
        remoteProviders = Array.isArray(data.providers) ? data.providers : [];
      } catch (e) {
        console.warn('加载预设提供商失败:', e.message);
      }
      this.providers = mergeBuiltinProviders(this.providers, remoteProviders);
    },

    save() {
      this.ensureNoteTemplates();
      const activeTemplate = this.currentNoteTemplate;
      this.noteTemplate = activeTemplate?.content || this.noteTemplate || DEFAULT_NOTE_TEMPLATE;
      localStorage.setItem('mineru_token', this.token);
      localStorage.setItem('mineru_model', this.model);
      localStorage.setItem('mineru_lang', this.lang);
      localStorage.setItem('note_template', this.noteTemplate);
      localStorage.setItem('note_templates', JSON.stringify(this.noteTemplates));
      localStorage.setItem('active_note_template_id', this.activeNoteTemplateId);
      localStorage.setItem('ai_providers', JSON.stringify(this.providers));
      localStorage.setItem('ai_current_provider', this.currentProviderId);
      localStorage.setItem('ai_model', this.aiModel);
      const effectiveProxy = autoProxyPrefix();
      mineru.setProxy(effectiveProxy);
      this._applyAgent();
    },

    _applyAgent() {
      const p = this.currentProvider;
      agent.configure(p?.baseUrl || '', this.aiModel, p?.apiKey || '');
    },

    selectProvider(id) {
      this.currentProviderId = id;
      this.aiModel = '';
    },

    // 快捷切换(对话/笔记场景即时生效,不弹 dirty)
    quickSwitch(providerId, modelId) {
      this.currentProviderId = providerId;
      this.aiModel = modelId;
      localStorage.setItem('ai_current_provider', this.currentProviderId);
      localStorage.setItem('ai_model', this.aiModel);
      this._applyAgent();
    },

    ensureNoteTemplates() {
      this.noteTemplates = normalizeNoteTemplates(this.noteTemplates, '', false);
      if (!this.noteTemplates.some((template) => template.id === this.activeNoteTemplateId)) {
        this.activeNoteTemplateId = this.noteTemplates[0]?.id || 'deep-reading';
      }
      this.noteTemplate = this.currentNoteTemplate?.content || this.noteTemplate || DEFAULT_NOTE_TEMPLATE;
    },

    selectNoteTemplate(id) {
      if (!this.noteTemplates.some((template) => template.id === id)) return;
      this.activeNoteTemplateId = id;
      this.noteTemplate = this.currentNoteTemplate?.content || this.noteTemplate;
    },

    addNoteTemplate(template = {}) {
      const id = `custom-note-${Date.now().toString(36)}`;
      this.noteTemplates.push({
        id,
        name: template.name || '自定义模板',
        description: template.description || '',
        prompt: template.prompt || DEFAULT_NOTE_PROMPT,
        content: template.content || '# {{title}}\n\n## 摘要\n\n## 关键点\n\n## 我的思考\n',
        builtin: false,
      });
      this.activeNoteTemplateId = id;
      this.noteTemplate = this.currentNoteTemplate.content;
      return id;
    },

    duplicateNoteTemplate(id) {
      const source = this.noteTemplates.find((template) => template.id === id);
      if (!source) return '';
      return this.addNoteTemplate({
        name: `${source.name} 副本`,
        description: source.description,
        prompt: source.prompt,
        content: source.content,
      });
    },

    removeNoteTemplate(id) {
      const target = this.noteTemplates.find((template) => template.id === id);
      if (!target || target.builtin || this.noteTemplates.length <= 1) return false;
      this.noteTemplates = this.noteTemplates.filter((template) => template.id !== id);
      if (this.activeNoteTemplateId === id) {
        this.activeNoteTemplateId = this.noteTemplates[0]?.id || 'deep-reading';
      }
      this.noteTemplate = this.currentNoteTemplate?.content || DEFAULT_NOTE_TEMPLATE;
      return true;
    },

    resetNoteTemplate(id) {
      const builtin = BUILTIN_NOTE_TEMPLATES.find((template) => template.id === id);
      const index = this.noteTemplates.findIndex((template) => template.id === id);
      if (!builtin || index < 0) return false;
      this.noteTemplates[index] = withBuiltinFlag(builtin);
      if (this.activeNoteTemplateId === id) this.noteTemplate = this.noteTemplates[index].content;
      return true;
    },

    addProvider(name, baseUrl, apiKey = '') {
      const id = 'custom_' + Date.now().toString(36);
      this.providers.push({ id, name, baseUrl, apiKey, builtin: false, models: [], customModels: [] });
      this.currentProviderId = id;
      this.aiModel = '';
      return id;
    },

    removeProvider(id) {
      const p = this.providers.find((p) => p.id === id);
      if (!p || p.builtin) return false;
      this.providers = this.providers.filter((p) => p.id !== id);
      if (this.currentProviderId === id) {
        this.currentProviderId = this.providers[0]?.id || '';
        this.aiModel = '';
      }
      return true;
    },

    updateProvider(id, patch) {
      const p = this.providers.find((p) => p.id === id);
      if (p) Object.assign(p, patch);
    },

    setProviderModels(id, models) {
      const p = this.providers.find((p) => p.id === id);
      if (p) p.models = models;
    },

    addCustomModel(id, modelId, modelName = '') {
      const p = this.providers.find((p) => p.id === id);
      if (p) {
        if (!p.customModels) p.customModels = [];
        p.customModels.push({ id: modelId, name: modelName || modelId });
      }
    },

    removeCustomModel(providerId, modelId) {
      const p = this.providers.find((p) => p.id === providerId);
      if (p && p.customModels) {
        p.customModels = p.customModels.filter((m) => m.id !== modelId);
      }
    },
  },
});
