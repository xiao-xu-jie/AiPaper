# 改造计划：Electron 化 + Agent 对话面板

## 目标
1. 将现有纯前端项目改为 Electron 桌面应用，可打包为 Windows .exe
2. 在右侧新增 AI 对话面板，可与当前论文实时对话（OpenAI 兼容接口）

---

## 架构决策

### CORS 问题解决方案
Electron 主进程通过 `session.webRequest.onHeadersReceived` 向所有响应注入 CORS 头，
让 renderer 的 fetch 请求不再被浏览器拦截。**proxy.js 在 Electron 下不再需要**，但保留供非 Electron 使用。

### ESM 兼容
- `main.js` 保持 ESM（项目 `"type": "module"`）
- `preload.cjs` 用 CJS 扩展名（Electron preload 需要 CJS）

---

## 改动清单

### 1. `package.json`
- 添加 `"main": "main.js"`
- 添加 devDependencies: `electron`, `electron-builder`
- 新增 scripts: `"start": "electron ."`, `"build": "electron-builder --win"`
- 添加 `"build"` 配置块（appId、productName、win/nsis、files 过滤）

### 2. `main.js`（新建）
- 创建 BrowserWindow（1400×900，contextIsolation: true）
- `session.defaultSession.webRequest.onHeadersReceived` 注入 CORS 头
- OPTIONS preflight 强制返回 200

### 3. `preload.cjs`（新建）
- 最小化 CJS 文件，暂无需暴露 API

### 4. `src/agent.js`（新建）
- AI 配置读取：`apiUrl`, `apiModel`, `apiKey`（来自 localStorage）
- `setContext(md)` 设置当前论文 Markdown 为系统上下文，切换论文时重置历史
- `chat(userMsg, onChunk)` 调用 OpenAI 流式接口，SSE 逐 token 回调
- `clearHistory()` 清空对话历史

### 5. `index.html`
- 配置区新增三个字段：AI 接口地址、AI 模型、AI 密钥（复用 save-config 按钮保存）
- viewer-head 新增「AI 助手」切换按钮
- `<main>` 内新增 `#chat-panel`（头部 + 消息列表 + 输入区）

### 6. `src/styles.css`
- `.main` 默认 2 列，`.main.chat-open` 变为 3 列（sidebar | viewer | chat 340px）
- 聊天面板、消息气泡（用户/助手区分）、输入区样式

### 7. `src/app.js`
- `init()` 回填 AI 配置字段
- `save-config` 按钮同步保存 AI 配置到 localStorage 并调用 agent 模块
- 新增 `#toggle-chat` 事件：切换 `.main.chat-open` 类
- `openPaper()` 调用 `agent.setContext(md)` 传入当前论文 Markdown
- `#chat-send` / Enter 键发送：调用 `agent.chat()`，流式追加到消息列表
- `#chat-clear` 清空对话历史

---

## 打包流程
```
npm install
npm run build   # → dist/ 下生成 .exe 安装包
```
