// store.js —— 本地文件夹存储层
// 基于 File System Access API 把所有数据写入用户选定的目录，
// 并用 IndexedDB 持久化目录句柄，实现下次自动加载历史数据。
//
// 目录结构：
//   <rootDir>/
//     <paperId>/
//       meta.json      论文元信息
//       original.pdf   原始文件
//       full.md        Markdown 结果
//       images/...     图片等资源

const IDB_NAME = 'aipaper';
const IDB_STORE = 'handles';
const HANDLE_KEY = 'rootDir';

// ---------- IndexedDB：持久化目录句柄 ----------
function idbOpen() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet(key, val) {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(val, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbGet(key) {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readonly');
    const req = tx.objectStore(IDB_STORE).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ---------- 目录句柄管理 ----------
let rootDir = null; // FileSystemDirectoryHandle

export function getRoot() {
  return rootDir;
}

export function isSupported() {
  return typeof window.showDirectoryPicker === 'function';
}

// 让用户选择数据文件夹
export async function pickDirectory() {
  rootDir = await window.showDirectoryPicker({ mode: 'readwrite' });
  await idbSet(HANDLE_KEY, rootDir);
  return rootDir;
}

// 尝试恢复上次选择的文件夹（需用户授权仍有效）
export async function restoreDirectory() {
  const handle = await idbGet(HANDLE_KEY);
  if (!handle) return null;
  const opts = { mode: 'readwrite' };
  // 已有权限直接用，否则返回 handle 让上层在用户手势中再请求
  if ((await handle.queryPermission(opts)) === 'granted') {
    rootDir = handle;
    return handle;
  }
  return handle; // 未授权，交给 ensurePermission
}

// 在用户手势中请求恢复句柄的权限
export async function ensurePermission(handle) {
  const opts = { mode: 'readwrite' };
  if ((await handle.queryPermission(opts)) === 'granted'
    || (await handle.requestPermission(opts)) === 'granted') {
    rootDir = handle;
    await idbSet(HANDLE_KEY, handle);
    return true;
  }
  return false;
}

function assertRoot() {
  if (!rootDir) throw new Error('尚未选择数据文件夹');
}

// ---------- 论文目录读写 ----------
async function getPaperDir(paperId, create = false) {
  assertRoot();
  return rootDir.getDirectoryHandle(paperId, { create });
}

async function writeFile(dir, name, data) {
  const fh = await dir.getFileHandle(name, { create: true });
  const w = await fh.createWritable();
  await w.write(data);
  await w.close();
}

async function readFileText(dir, name) {
  try {
    const fh = await dir.getFileHandle(name);
    return (await fh.getFile()).text();
  } catch {
    return null;
  }
}

// 写入/更新论文元信息
export async function saveMeta(paperId, meta) {
  const dir = await getPaperDir(paperId, true);
  await writeFile(dir, 'meta.json', JSON.stringify(meta, null, 2));
}

export async function loadMeta(paperId) {
  const dir = await getPaperDir(paperId);
  const txt = await readFileText(dir, 'meta.json');
  return txt ? JSON.parse(txt) : null;
}

// 保存原始 PDF
export async function savePdf(paperId, blob) {
  const dir = await getPaperDir(paperId, true);
  await writeFile(dir, 'original.pdf', blob);
}

// 读取原始 PDF（返回 object URL 供预览）
export async function getPdfUrl(paperId) {
  try {
    const dir = await getPaperDir(paperId);
    const fh = await dir.getFileHandle('original.pdf');
    return URL.createObjectURL(await fh.getFile());
  } catch {
    return null;
  }
}

// 保存 Markdown
export async function saveMarkdown(paperId, text) {
  const dir = await getPaperDir(paperId, true);
  await writeFile(dir, 'full.md', text);
}

export async function loadMarkdown(paperId) {
  const dir = await getPaperDir(paperId);
  return readFileText(dir, 'full.md');
}

// 保存解压出的资源（图片等），保留相对路径
export async function saveAsset(paperId, relPath, data) {
  const dir = await getPaperDir(paperId, true);
  const parts = relPath.split('/').filter(Boolean);
  const name = parts.pop();
  let cur = dir;
  for (const p of parts) {
    cur = await cur.getDirectoryHandle(p, { create: true });
  }
  await writeFile(cur, name, data);
}

// 读取某个资源为 object URL（用于在 markdown 中显示图片）
export async function getAssetUrl(paperId, relPath) {
  try {
    const dir = await getPaperDir(paperId);
    const parts = relPath.split('/').filter(Boolean);
    const name = parts.pop();
    let cur = dir;
    for (const p of parts) cur = await cur.getDirectoryHandle(p);
    const fh = await cur.getFileHandle(name);
    return URL.createObjectURL(await fh.getFile());
  } catch {
    return null;
  }
}

// 列出所有历史论文（读取每个子目录的 meta.json）
export async function listPapers() {
  assertRoot();
  const papers = [];
  for await (const [name, handle] of rootDir.entries()) {
    if (handle.kind !== 'directory') continue;
    const txt = await readFileText(handle, 'meta.json');
    if (txt) {
      try { papers.push(JSON.parse(txt)); } catch { /* 跳过损坏的 */ }
    }
  }
  // 按创建时间倒序
  papers.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  return papers;
}

// 删除某篇论文
export async function deletePaper(paperId) {
  assertRoot();
  await rootDir.removeEntry(paperId, { recursive: true });
}

// ---------- AI 会话 ----------
async function getChatsDir(paperId, create = false) {
  const dir = await getPaperDir(paperId, create);
  return dir.getDirectoryHandle('chats', { create });
}

export async function listChats(paperId) {
  try {
    const dir = await getChatsDir(paperId);
    const sessions = [];
    for await (const [, fh] of dir.entries()) {
      if (fh.kind !== 'file') continue;
      try {
        const txt = await (await fh.getFile()).text();
        const s = JSON.parse(txt);
        sessions.push(s);
      } catch { /* 跳过损坏文件 */ }
    }
    sessions.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    return sessions;
  } catch { return []; }
}

export async function saveChat(paperId, session) {
  const dir = await getChatsDir(paperId, true);
  await writeFile(dir, `${session.id}.json`, JSON.stringify(session, null, 2));
}

export async function deleteChat(paperId, chatId) {
  try {
    const dir = await getChatsDir(paperId);
    await dir.removeEntry(`${chatId}.json`);
  } catch { /* 忽略 */ }
}

// ---------- 阅读笔记 ----------
export async function saveNote(paperId, text) {
  const dir = await getPaperDir(paperId, true);
  await writeFile(dir, 'note.md', text);
}

export async function loadNote(paperId) {
  const dir = await getPaperDir(paperId);
  return readFileText(dir, 'note.md');
}

// ---------- 目录树 ----------
export async function saveFolders(tree) {
  assertRoot();
  await writeFile(rootDir, '_folders.json', JSON.stringify(tree, null, 2));
}

export async function loadFolders() {
  try {
    const txt = await readFileText(rootDir, '_folders.json');
    return txt ? JSON.parse(txt) : null;
  } catch { return null; }
}

// ---------- 翻译 ----------
// translations: [{ id, anchorText, translation, createdAt }]
// anchorText 是选中原文(用于定位插入位置),translation 是译文
export async function saveTranslations(paperId, translations) {
  const dir = await getPaperDir(paperId, true);
  await writeFile(dir, 'translations.json', JSON.stringify(translations, null, 2));
}

export async function loadTranslations(paperId) {
  try {
    const dir = await getPaperDir(paperId);
    const txt = await readFileText(dir, 'translations.json');
    return txt ? JSON.parse(txt) : [];
  } catch { return []; }
}
