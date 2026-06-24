// proxy.js —— 可选的本地代理（零依赖，仅用 Node 内置模块）
// 用途：当浏览器直连 mineru.net 或其 OSS 上传地址被 CORS 拦截时，
//       前端把请求发到本代理，由它转发并补上 CORS 响应头。
//
// 启动：node proxy.js   （默认监听 8788 端口）
// 前端「代理前缀」填：http://localhost:8788/proxy?url=
//
// 同时它也作为静态服务器托管本目录，方便用 http://localhost:8788/ 打开应用。

import http from "node:http";
import https from "node:https";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PORT = process.env.PORT || 8788;
const ROOT = path.dirname(fileURLToPath(import.meta.url));

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
};

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Authorization,Content-Type,Accept",
  );
}

function sanitizeProxyHeaders(headers) {
  const next = { ...headers };
  for (const key of Object.keys(next)) {
    if (key.toLowerCase().startsWith("access-control-")) delete next[key];
  }
  return next;
}

// 转发请求到目标 URL，补 CORS。
// 关键点：
//  1) 只转发干净的必要头。浏览器特有头（sec-*、origin、referer、
//     accept-encoding 等）会干扰阿里云 OSS 签名校验并导致连接被重置。
//  2) OSS 直传要求【不带 Content-Type】（见 MinerU 文档），否则破坏签名。
//     因此仅当请求体是 JSON（调用 MinerU API）时才转发 content-type。
//  3) 先把请求体完整缓冲再转发，并对所有流加错误处理，确保代理永不崩溃。
function handleProxy(req, res, target) {
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("error", () => {}); // 忽略客户端中断，避免抛出未处理错误
  req.on("end", () => {
    const body = Buffer.concat(chunks);
    const lib = target.startsWith("https") ? https : http;
    let u;
    try {
      u = new URL(target);
    } catch {
      setCors(res);
      res.writeHead(400);
      res.end("bad url");
      return;
    }

    const ctype = (req.headers["content-type"] || "").toLowerCase();
    const headers = { host: u.host };
    if (body.length) headers["content-length"] = body.length;
    // 仅对 JSON 和 multipart 转发 content-type；OSS 直传必须不带
    if (ctype.includes("application/json") || ctype.includes("multipart/form-data"))
      headers["content-type"] = req.headers["content-type"];
    if (req.headers.authorization)
      headers.authorization = req.headers.authorization;

    const proxyReq = lib.request(
      u,
      { method: req.method, headers },
      (proxyRes) => {
        setCors(res);
        res.writeHead(proxyRes.statusCode || 502, sanitizeProxyHeaders(proxyRes.headers));
        proxyRes.on("error", () => res.end());
        proxyRes.pipe(res);
      },
    );
    proxyReq.on("error", (err) => {
      setCors(res);
      try {
        res.writeHead(502, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({ code: -1, msg: "代理转发失败: " + err.message }),
        );
      } catch {
        /* 响应已发出 */
      }
    });
    if (body.length) proxyReq.write(body);
    proxyReq.end();
  });
}

const DIST = path.join(ROOT, "dist");

function handleStatic(req, res, pathname) {
  const base = fs.existsSync(DIST) ? DIST : ROOT;
  let filePath = path.join(base, decodeURIComponent(pathname));
  if (pathname === "/" || pathname === "")
    filePath = path.join(base, "index.html");
  if (!filePath.startsWith(base)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      // 如果是请求具体文件（有扩展名），返回 404
      // 只有无扩展名的路径才回退到 index.html（用于 SPA 路由）
      if (path.extname(filePath)) {
        res.writeHead(404);
        res.end("Not Found");
        return;
      }
      const indexFile = path.join(base, "index.html");
      fs.readFile(indexFile, (err2, d) => {
        if (err2) {
          res.writeHead(404);
          res.end("Not Found");
          return;
        }
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(d);
      });
      return;
    }
    res.writeHead(200, {
      "Content-Type":
        MIME[path.extname(filePath)] || "application/octet-stream",
    });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (req.method === "OPTIONS") {
    setCors(res);
    res.writeHead(204);
    res.end();
    return;
  }

  if (url.pathname === "/proxy") {
    const target = url.searchParams.get("url");
    if (!target) {
      res.writeHead(400);
      res.end("missing url");
      return;
    }
    handleProxy(req, res, target);
    return;
  }

  // 版本检查接口
  if (url.pathname === "/api/version") {
    setCors(res);
    if (req.method === "OPTIONS") {
      res.writeHead(200);
      res.end();
      return;
    }
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(
      JSON.stringify({
        version: "2.3.0",
        downloadUrl: "https://cdn.aipaper.chat/AI%20Paper%20Setup%202.3.0.exe",
        changelog:
          "📚 论文元数据与阅读工作流 | 📦 批量解析队列 | 🖼 图表库 | 📝 模板化笔记 | 🤖 AI 调用体验优化 | ⚡ 大文档性能优化",
        releaseDate: "2026-06-24",
      }),
    );
    return;
  }

  // 预设免费 AI 提供商列表
  if (url.pathname === "/api/providers") {
    setCors(res);
    if (req.method === "OPTIONS") {
      res.writeHead(200);
      res.end();
      return;
    }
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(
      JSON.stringify({
        providers: [
          {
            id: "opencode-zen",
            name: "OpenCode Zen (Free)",
            baseUrl: "https://opencode.ai/zen/v1",
            apiKey: "",
            builtin: true,
            models: [
              { id: "deepseek-v4-flash-free", name: "DeepSeek V4 Flash" },
              { id: "mimo-v2.5-free", name: "MimoV2.5" },
              { id: "nemotron-3-ultra-free", name: "Nemotron 3 Ultra" },
              { id: "nemotron-3-super-free", name: "Nemotron 3 Super" },
            ],
          },
          {
            id: "kilo",
            name: "Kilo (Free Router)",
            baseUrl: "https://api.kilo.ai/api/gateway",
            apiKey: "",
            builtin: true,
            models: [{ id: "kilo-auto/free", name: "Kilo Auto (Free Router)" }],
          },
        ],
      }),
    );
    return;
  }

  handleStatic(req, res, url.pathname);
});

server.listen(PORT, () => {
  console.log(`\n  AI Paper 已启动`);
  console.log(`  应用地址:   http://localhost:${PORT}/`);
  console.log(`  代理前缀:   http://localhost:${PORT}/proxy?url=\n`);
});
