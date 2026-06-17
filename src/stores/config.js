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

export const useConfigStore = defineStore('config', {
  state: () => ({
    token: localStorage.getItem('mineru_token') || '',
    model: localStorage.getItem('mineru_model') || 'vlm',
    lang: localStorage.getItem('mineru_lang') || 'ch',
    aiUrl: localStorage.getItem('ai_url') || '',
    aiModel: localStorage.getItem('ai_model') || '',
    aiKey: localStorage.getItem('ai_key') || '',
    noteTemplate: localStorage.getItem('note_template') || DEFAULT_NOTE_TEMPLATE,
  }),
  actions: {
    init() {
      const effectiveProxy = autoProxyPrefix();
      mineru.setProxy(effectiveProxy);
      agent.configure(this.aiUrl, this.aiModel, this.aiKey);
    },
    save() {
      localStorage.setItem('mineru_token', this.token);
      localStorage.setItem('mineru_model', this.model);
      localStorage.setItem('mineru_lang', this.lang);
      localStorage.setItem('ai_url', this.aiUrl);
      localStorage.setItem('ai_model', this.aiModel);
      localStorage.setItem('ai_key', this.aiKey);
      localStorage.setItem('note_template', this.noteTemplate);
      const effectiveProxy = autoProxyPrefix();
      mineru.setProxy(effectiveProxy);
      agent.configure(this.aiUrl, this.aiModel, this.aiKey);
    },
  },
});
