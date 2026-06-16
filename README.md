# AI Paper · MinerU 论文在线解析

一个**纯前端**的论文解析与 Markdown 预览工具。你提供自己的 MinerU Token，上传 PDF，应用调用 [MinerU 精准解析 API](https://mineru.net/apiManage/docs) 完成解析，并把所有数据（原始 PDF、Markdown、图片）保存到你指定的本地文件夹，下次自动加载。

## 功能

- 🔑 用户自备 MinerU Token（保存在浏览器本地，不上传任何第三方）
- 📤 上传 PDF（支持点击选择与拖拽），自动走「申请上传链接 → 直传 → 轮询解析」流程
- 📊 实时解析进度（上传百分比、解析页数）
- 📝 Markdown 在线预览，支持图片、表格、数学公式（KaTeX）、代码高亮
- 📄 原文 PDF 预览，与 Markdown 一键切换
- 📁 数据全部存入你选择的本地文件夹，支持多篇论文切换
- 🕑 历史数据自动加载（基于 File System Access API + IndexedDB 句柄持久化）

## 运行

需要 **Chrome / Edge 等支持 File System Access API 的浏览器**，且页面需运行在 `localhost`。

```bash
node proxy.js
```

然后浏览器打开 http://localhost:8788/

> `proxy.js` 零依赖（仅用 Node 内置模块），同时充当静态服务器和可选的 CORS 代理。

## 使用步骤

1. 在 [mineru.net API 管理页](https://mineru.net/apiManage/docs) 创建 Token
2. 打开应用，填入 Token、选择模型/语言，点「保存设置」
3. 点「选择数据文件夹」，指定一个本地目录用于存储
4. 点「＋ 上传 PDF」或直接拖入 PDF，等待解析完成
5. 左侧列表切换论文，右侧切换 Markdown / 原文 PDF 预览

## 关于 CORS

浏览器直连 `mineru.net` 与其 OSS 上传地址可能被跨域策略拦截。若上传或请求报「网络错误（可能为 CORS 限制）」：

1. 确保 `node proxy.js` 正在运行
2. 在应用「代理前缀」中填入：`http://localhost:8788/proxy?url=`
3. 重新「保存设置」并重试

代理会把请求转发到 MinerU 并补上 CORS 响应头。

## 数据目录结构

```
<你选择的文件夹>/
  p_xxxxx/                 每篇论文一个目录
    meta.json              标题、batch_id、状态、模型、时间
    original.pdf           原始 PDF
    full.md                Markdown 解析结果
    images/...             解压出的图片等资源
```

删除论文会连同其目录一并移除。

## 文件说明

| 文件 | 作用 |
|------|------|
| `index.html` | 页面结构 |
| `src/styles.css` | 样式 |
| `src/app.js` | 主控制器：设置、上传解析、列表、预览 |
| `src/mineru.js` | MinerU API 客户端（申请链接 / 上传 / 轮询 / 下载） |
| `src/store.js` | 本地文件夹存储层（File System Access API + IndexedDB） |
| `src/render.js` | Markdown 渲染（图片路径替换 + 公式 + 代码高亮） |
| `proxy.js` | 静态服务器 + 可选 CORS 代理 |

## 技术说明

- 精准解析 API 默认用 `vlm` 模型，单文件 ≤ 200MB、≤ 200 页
- 第三方库（marked / KaTeX / highlight.js / JSZip）通过 CDN 引入
- Token 与设置存于 `localStorage`，目录句柄存于 `IndexedDB`，均不离开本机
