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
    title: 'AI Paper - X',
    icon: path.join(__dirname, 'assets/icon.ico'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const devUrl = process.env.ELECTRON_START_URL;
  if (devUrl) {
    win.loadURL(devUrl);
  } else {
    win.loadFile(path.join(__dirname, 'dist/index.html'));
  }
}

app.whenReady().then(() => {
  const ses = session.defaultSession;

  // 去掉 Origin 头，避免 Chromium 在发出请求前因 CORS 拒绝
  ses.webRequest.onBeforeSendHeaders((details, callback) => {
    const headers = { ...details.requestHeaders };
    delete headers['Origin'];
    delete headers['origin'];
    callback({ requestHeaders: headers });
  });

  // 在响应头里注入 CORS，让 renderer fetch 拿到正确的许可
  ses.webRequest.onHeadersReceived((details, callback) => {
    const headers = { ...details.responseHeaders };
    headers['access-control-allow-origin'] = ['*'];
    headers['access-control-allow-headers'] = ['Authorization, Content-Type, Accept'];
    headers['access-control-allow-methods'] = ['GET, POST, PUT, DELETE, OPTIONS'];
    if (details.method === 'OPTIONS') {
      callback({ statusLine: 'HTTP/1.1 200 OK', responseHeaders: headers });
    } else {
      callback({ responseHeaders: headers });
    }
  });

  createWindow();
});
app.on('window-all-closed', () => app.quit());
