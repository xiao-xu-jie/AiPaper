# AI Paper v2.0.0

基于 MinerU 的论文在线解析与 Markdown 预览工具

## ✨ 主要功能

### 📄 PDF 解析
- 使用 MinerU API 精准解析 PDF 论文
- 支持中英文、日文、韩文多语言
- 自动提取图片和表格
- 生成高质量 Markdown 文档

### 📖 多视图查看
- **Markdown 视图**：清晰的文本和公式渲染（KaTeX）
- **原文 PDF**：对照原文阅读
- **阅读笔记**：AI 自动生成或手动编辑

### 🎯 智能功能
- **大纲导航**：自动提取标题层级，快速跳转
- **图片预览**：点击图片全屏查看，支持快捷复制
- **右键菜单**：
  - 图片：复制图片、向 AI 提问
  -文字：复制为 Markdown/纯文本、向 AI 提问

### 🤖 AI 助手
- 基于论文内容的智能对话
- 支持文字和图片提问
- 多会话管理
- 自动生成结构化阅读笔记

### 💾 本地存储
- 使用 File System Access API 存储所有数据
- 支持文件夹组织管理
- 自动恢复上次工作状态

### 🔄 版本更新
- 自动检查新版本
- 一键复制下载链接

## 📦 安装使用

### Windows 客户端
1. 下载 `AI Paper Setup 2.0.0.exe`
2. 运行安装程序
3. 配置 MinerU Token（访问 https://mineru.net/apiManage/token）
4. 选择数据文件夹
5. 开始使用

### 网页版
访问：https://aipaper.chat

## ⚙️ 配置说明

### 必需配置
- **MinerU Token**：用于 PDF 解析（在 mineru.net 申请）

### 可选配置
- **AI 接口地址**：OpenAI 兼容 API（如 https://api.openai.com/v1）
- **AI 密钥**：对应服务的 API Key
- **AI 模型**：自动获取模型列表或手动输入

## 🛠️ 技术栈

- **前端框架**：Vue 3 + Pinia
- **桌面端**：Electron 31
- **Markdown 渲染**：marked + KaTeX + highlight.js
- **构建工具**：Vite 6
- **代码高亮**：highlight.js
- **数学公式**：KaTeX

## 📝 更新日志

### 新功能
- ✨ 支持 Markdown 和阅读笔记的大纲导航
- ✨ 图片点击预览和快捷复制
- ✨ 右键菜单增强（图片/文字快捷操作）
- ✨ 版本检查和更新提示
- ✨ 详细的使用帮助文档
- ✨ 前置校验和友好错误提示

### 优化改进
- 🎨 界面显示 Logo
- 🎨 底部版权信息
- 🎨 优化配置面板布局
- 🔧 自动代理配置（网页版）
- 🔧 详细的笔记模板

### Bug 修复
- 🐛 修复网页端笔记宽度异常
- 🐛 修复 PDF 预览宽度问题
- 🐛 修复大纲面板空内容占位

## 📄 开源协议

MIT License

## 👤 作者

小徐

## 🔗 相关链接

- GitHub: https://github.com/xiao-xu-jie/AiPaper
- 在线版本: https://aipaper.chat
- MinerU 官网: https://mineru.net

---

**注意**：首次使用需要配置 MinerU Token 才能解析 PDF 文件。AI 功能为可选，不配置也可以查看已解析的论文。
