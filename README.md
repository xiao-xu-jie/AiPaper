# AI Paper · 本地论文知识库与 AI 阅读助手

基于 [MinerU](https://mineru.net) API 的 PDF 论文解析、Markdown 预览与 AI 辅助阅读桌面应用。上传 PDF 后会自动解析为 Markdown，并把论文元数据、阅读状态、标签、笔记、图表、注解和 AI 对话都保存在你指定的本地文件夹中。

当前版本：**v2.3.0**

## 功能

### 📄 PDF 解析与预览
- 🔑 用户自备 MinerU Token（保存在本地，不上传任何第三方）
- 📤 上传 PDF（支持点击选择与拖拽），自动走「申请上传链接 → 直传 → 轮询解析」流程
- 📦 批量解析队列，支持进度展示、暂停、继续、取消排队项、失败重试和清除完成项
- 📊 实时解析进度（上传百分比、解析页数、下载结果状态）
- 📝 Markdown 在线预览，支持图片、表格、数学公式（KaTeX）、代码高亮
- 📄 原文 PDF 预览，与 Markdown 一键切换
- 📁 数据全部存入你选择的本地文件夹，支持多篇论文切换
- 🕑 历史数据自动加载（基于 File System Access API + IndexedDB 句柄持久化）

### 📚 论文库与研究工作流
- 自动提取结构化元数据：标题、作者、机构、年份、DOI、arXiv、会议/期刊、关键词、摘要、代码仓库
- 论文信息弹窗支持手动修正元数据
- 阅读状态、优先级、评分、阅读目的、截止日期、已复现、已加入综述等工作流字段
- 左侧论文列表展示阅读状态、优先级、评分和工作流提示
- 搜索支持题目、备注、上传时间、标签、元数据和工作流字段
- 支持按标签、阅读状态、优先级、解析状态筛选论文
- 标签库支持手动添加、筛选、统一管理和 AI 自动生成标签

### 🖼 图表库
- 独立图表库页签，集中展示 MinerU 解析出的图片资源
- 自动识别 Markdown 正文引用，按正文顺序展示图表
- 支持搜索图名、路径、章节和 caption
- 支持按全部、正文引用、未引用筛选
- 支持预览、下载、复制图片、复制 Markdown 引用
- 可直接向 AI 提问某张图，并可定位回 Markdown 正文

### 🌐 翻译
- 选中内容右键翻译，译文流式显示（打字效果）
- hover 段落高亮提示，右键可直接翻译整段
- 译文插入选中内容下方，支持复制与删除
- 翻译内容持久化保存，切换论文后自动恢复

### 🖍 高亮与注解
- 选中内容右键高亮，5 种颜色可选（黄/绿/蓝/粉/橙）
- 点击高亮文字可删除高亮
- 选中内容添加注解笔记，支持编辑与删除
- 原文标记与注解块双向定位：点击原文标记跳转注解，点击注解跳转原文
- 高亮和注解持久化保存

### 🤖 AI 助手
- 多 AI 提供商支持，内置免费提供商（OpenCode Zen / Kilo）可直接使用
- 支持添加自定义提供商（名称 + 接口地址 + 密钥）
- 每个提供商可获取模型列表或手动添加自定义模型
- AI 对话面板，流式渲染，支持图片粘贴提问
- 支持取消生成、重试上一条、重新生成回答
- 显示模型、耗时和 token 估算
- 生成中停止按钮固定在输入区，长回复时也方便点击
- 右键选中内容/图片快捷向 AI 提问
- 自动生成结构化阅读笔记（AI 流式生成，支持停止并保留已生成内容）
- 每篇论文可保存多篇阅读笔记，适合用不同模板分别生成速读、精读、复现计划等内容
- AI 助手和笔记生成支持快捷切换模型供应商

### 📝 模板化阅读笔记
- 内置快速阅读、精读、综述、复现实验、组会汇报、方法拆解、代码复现计划等模板
- 笔记页可快速选择模板并套用到编辑区
- 顶栏提供独立「笔记模板」入口，模板管理不再藏在 AI 模型配置深处
- 每个模板可绑定独立 AI prompt，生成更稳定的结构化笔记
- AI 配置页支持新增、复制、删除自定义模板，也支持重置内置模板
- 兼容旧版单一阅读笔记模板配置

### 🎯 其他
- 大纲导航：自动提取标题层级，快速跳转
- 图片预览：点击图片全屏查看，支持快捷复制
- 大文档性能优化：图片懒加载、object URL 释放、公式延迟渲染、流式 Markdown 渲染节流
- 右键论文操作菜单自动贴合视窗，避免显示不全
- 版本检查与更新提示（桌面版）

## 运行

### 桌面版（推荐）

下载最新版本：[GitHub Releases](https://github.com/xiao-xu-jie/AiPaper/releases)

### 网页版

需要 **Chrome / Edge 等支持 File System Access API 的浏览器**，且页面需运行在 `localhost`。

```bash
node proxy.js
```

然后浏览器打开 http://localhost:8788/

> `proxy.js` 零依赖（仅用 Node 内置模块），同时充当静态服务器和可选的 CORS 代理。

### 开发模式

```bash
npm install
npm run dev
```

同时启动 Vite 开发服务器和 Electron，支持热更新。

## 使用步骤

1. 在 [mineru.net API 管理页](https://mineru.net/apiManage/token) 创建 Token
2. 打开应用，点击顶部「⚙️ MinerU」按钮，填入 Token、选择模型/语言，点「保存」
3. 在弹窗中点「📁 选择数据文件夹」，指定一个本地目录用于存储
4. （可选）点击顶部「🤖 AI 模型」按钮，选择 AI 提供商和模型
5. 点「＋ 上传 PDF」或直接拖入 PDF，等待解析完成
6. 左侧列表切换论文，右侧切换 Markdown / 原文 PDF / 图表库 / 阅读笔记
7. 在 Markdown 中选中文字右键，可翻译、高亮、添加注解或向 AI 提问
8. 右键论文可编辑备注、标签、论文信息与阅读状态，也可下载 Markdown / 阅读笔记
9. 在阅读笔记页选择模板，可套用模板或让 AI 按模板生成笔记

## 关于 CORS

浏览器直连 `mineru.net` 与其 OSS 上传地址可能被跨域策略拦截。网页版会自动使用同源代理，桌面版（Electron）由主进程注入 CORS 头，无需额外配置。

## 数据目录结构

```
<你选择的文件夹>/
  _folders.json            目录树（如有）
  _tags.json               标签库（如有）
  p_xxxxx/                 每篇论文一个目录
    meta.json              论文状态、元数据、标签、阅读工作流字段
    original.pdf           原始 PDF
    full.md                Markdown 解析结果
    images/...             解压出的图片等资源
    note.md                旧版单篇阅读笔记（兼容历史数据）
    notes/                 多篇阅读笔记（v2.3 后）
      index.json           笔记索引、当前激活笔记
      note_xxx.md          单篇阅读笔记正文
    translations.json      翻译记录（如有）
    annotations.json       高亮和注解记录（如有）
    chats/                 AI 对话会话（如有）
      chat_xxx.json        每个会话一个文件
```

删除论文会连同其目录一并移除。

## 技术栈

- **桌面端**：Electron 31
- **前端框架**：Vue 3 + Pinia
- **构建工具**：Vite 6
- **Markdown 渲染**：marked + KaTeX + highlight.js
- **ZIP 解压**：JSZip
- **打包工具**：electron-builder（NSIS 安装包）

## 项目结构

```
├── main.js              # Electron 主进程（CORS 头注入）
├── preload.cjs          # Electron preload
├── proxy.js             # 网页版静态服务器 + CORS 代理
├── index.html           # SPA 入口
├── vite.config.js       # Vite 构建配置
├── package.json         # 依赖与 electron-builder 配置
├── version_changelog.json  # 版本更新清单
├── src/
│   ├── main.js          # Vue 应用入口
│   ├── App.vue          # 根组件
│   ├── components/      # Vue 组件
│   │   ├── TopBar.vue          # 顶栏（配置入口按钮）
│   │   ├── MinerUConfigDialog.vue  # MinerU 配置弹窗
│   │   ├── AIConfigDialog.vue      # AI 模型配置弹窗
│   │   ├── ExtensionsDialog.vue    # 扩展连接（如思源笔记）
│   │   ├── ModelSwitcher.vue       # 模型快捷切换组件
│   │   ├── Sidebar.vue        # 左侧目录树
│   │   ├── FolderNode.vue     # 递归目录节点
│   │   ├── Viewer.vue         # 主视图（Markdown/PDF/图表库/笔记 + 翻译/高亮/注解）
│   │   ├── FiguresView.vue    # 图表库
│   │   ├── NotesView.vue      # 阅读笔记
│   │   ├── PaperDetailsDialog.vue  # 论文信息与阅读工作流
│   │   ├── UploadQueuePanel.vue    # 批量解析队列
│   │   ├── ChatPanel.vue      # AI 对话面板
│   │   └── SessionPicker.vue  # 会话选择器
│   ├── stores/          # Pinia 状态管理
│   │   ├── config.js    # 配置（多 AI 提供商、笔记模板）
│   │   ├── papers.js    # 论文列表、解析队列、元数据与工作流
│   │   ├── folders.js   # 目录树
│   │   ├── tags.js      # 标签库
│   │   └── chat.js      # AI 对话会话
│   ├── lib/             # 业务逻辑模块
│   │   ├── mineru.js    # MinerU API 客户端
│   │   ├── store.js     # 本地文件存储层
│   │   ├── render.js    # Markdown 渲染
│   │   ├── paperMeta.js # 论文元数据与阅读工作流工具
│   │   ├── siyuan.js    # 思源笔记同步客户端
│   │   └── agent.js     # OpenAI 兼容流式对话客户端
│   └── styles/global.css  # 全局样式
├── assets/              # 图标、Logo
├── public/download.html # 网页版下载引导页
└── ROADMAP_IDEAS.md     # 功能路线图与当前实现状态
```

## 技术说明

- 精准解析 API 默认用 `vlm` 模型，单文件 ≤ 200MB、≤ 200 页
- Token 与设置存于 `localStorage`，目录句柄存于 `IndexedDB`，均不离开本机
- AI 配置（提供商、模型、密钥、阅读笔记模板）存于 `localStorage`
- 论文元数据、标签、阅读状态、翻译、高亮、注解、多篇笔记、对话记录存于用户选择的本地文件夹
- Markdown 图片采用懒加载策略，本地 object URL 会在组件卸载或重渲染时释放
- 大文档会延迟执行公式渲染和标注/翻译恢复，降低初次打开卡顿
- 桌面版 Electron 主进程通过 `session.webRequest` 注入 CORS 头，无需代理
- 网页版自动使用同源代理（`/proxy?url=`）转发请求
- 桌面版更新检查读取 `https://aipaper.chat/api/version`，网页版读取同源 `/api/version`

## 发布说明

- 最新版本：`v2.3.0`
- Windows 安装包：`AI Paper Setup 2.3.0.exe`
- 版本清单：`version_changelog.json`
- 下载页：`public/download.html`
- 手动发布 GitHub Release 时，tag 使用 `v2.3.0`，安装包文件名需与下载页和版本接口保持一致。

## 相关链接

- GitHub: https://github.com/xiao-xu-jie/AiPaper
- 在线版本: https://aipaper.chat
- MinerU 官网: https://mineru.net

## 开源协议

MIT License

## 作者

小徐
