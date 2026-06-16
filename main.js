import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { app, BrowserWindow, session } = require('electron');

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: 'AI Paper',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // 注入 CORS 头，让 renderer 的 fetch 可直连 MinerU API 和 AI API
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const headers = { ...details.responseHeaders };
    headers['access-control-allow-origin'] = ['*'];
    headers['access-control-allow-headers'] = ['Authorization, Content-Type, Accept'];
    headers['access-control-allow-methods'] = ['GET, POST, PUT, DELETE, OPTIONS'];
    // OPTIONS preflight 强制 200
    if (details.method === 'OPTIONS') {
      callback({ statusLine: 'HTTP/1.1 200 OK', responseHeaders: headers });
    } else {
      callback({ responseHeaders: headers });
    }
  });

  win.loadFile('index.html');
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
