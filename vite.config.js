import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import http from 'node:http';
import https from 'node:https';

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization,Content-Type,Accept');
}

function sanitizeProxyHeaders(headers) {
  const next = { ...headers };
  for (const key of Object.keys(next)) {
    if (key.toLowerCase().startsWith('access-control-')) delete next[key];
  }
  return next;
}

function devProxyPlugin() {
  return {
    name: 'aipaper-dev-proxy',
    configureServer(server) {
      server.middlewares.use('/proxy', (req, res) => {
        const requestUrl = new URL(req.url || '', 'http://localhost');
        const target = requestUrl.searchParams.get('url');
        if (!target) {
          setCors(res);
          res.statusCode = 400;
          res.end('missing url');
          return;
        }

        const chunks = [];
        req.on('data', (chunk) => chunks.push(chunk));
        req.on('end', () => {
          const body = Buffer.concat(chunks);
          let parsed;
          try {
            parsed = new URL(target);
          } catch {
            setCors(res);
            res.statusCode = 400;
            res.end('bad url');
            return;
          }

          const ctype = String(req.headers['content-type'] || '').toLowerCase();
          const headers = { host: parsed.host };
          if (body.length) headers['content-length'] = body.length;
          if (ctype.includes('application/json') || ctype.includes('multipart/form-data')) {
            headers['content-type'] = req.headers['content-type'];
          }
          if (req.headers.authorization) headers.authorization = req.headers.authorization;

          const lib = parsed.protocol === 'https:' ? https : http;
          const proxyReq = lib.request(parsed, { method: req.method, headers }, (proxyRes) => {
            setCors(res);
            res.writeHead(proxyRes.statusCode || 502, sanitizeProxyHeaders(proxyRes.headers));
            proxyRes.pipe(res);
          });
          proxyReq.on('error', (err) => {
            setCors(res);
            res.writeHead(502, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ code: -1, msg: '代理转发失败: ' + err.message }));
          });
          if (body.length) proxyReq.write(body);
          proxyReq.end();
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [vue(), devProxyPlugin()],
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
