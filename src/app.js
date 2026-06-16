// app.js —— 主控制器：串联设置、上传解析、历史加载、论文切换、预览
import * as store from './store.js';
import * as mineru from './mineru.js';
import { renderMarkdown } from './render.js';
import * as agent from './agent.js';

// ---------- 配置（localStorage） ----------
const CFG = {
  get token() { return localStorage.getItem('mineru_token') || ''; },
  set token(v) { localStorage.setItem('mineru_token', v); },
  get model() { return localStorage.getItem('mineru_model') || 'vlm'; },
  set model(v) { localStorage.setItem('mineru_model', v); },
  get lang() { return localStorage.getItem('mineru_lang') || 'ch'; },
  set lang(v) { localStorage.setItem('mineru_lang', v); },
  get proxy() { return localStorage.getItem('mineru_proxy') || ''; },
  set proxy(v) { localStorage.setItem('mineru_proxy', v); },
  get aiUrl() { return localStorage.getItem('ai_url') || ''; },
  set aiUrl(v) { localStorage.setItem('ai_url', v); },
  get aiModel() { return localStorage.getItem('ai_model') || ''; },
  set aiModel(v) { localStorage.setItem('ai_model', v); },
  get aiKey() { return localStorage.getItem('ai_key') || ''; },
  set aiKey(v) { localStorage.setItem('ai_key', v); },
};

// ---------- 全局状态 ----------
const state = {
  papers: [],        // 历史论文 meta 列表
  currentId: null,   // 当前选中的 paperId
};

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

function uid() {
  return 'p_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
}

function toast(msg, type = 'info') {
  const el = $('#toast');
  el.textContent = msg;
  el.className = `toast show ${type}`;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { el.className = 'toast'; }, 3500);
}

// ---------- 初始化 ----------
async function init() {
  if (!store.isSupported()) {
    $('#unsupported').style.display = 'flex';
    return;
  }
  // 回填配置
  $('#token').value = CFG.token;
  $('#model').value = CFG.model;
  $('#lang').value = CFG.lang;
  $('#proxy').value = CFG.proxy;
  $('#ai-url').value = CFG.aiUrl;
  $('#ai-model').value = CFG.aiModel;
  $('#ai-key').value = CFG.aiKey;
  mineru.setProxy(CFG.proxy);
  agent.configure(CFG.aiUrl, CFG.aiModel, CFG.aiKey);

  bindEvents();

  // 尝试恢复上次的数据文件夹
  const handle = await store.restoreDirectory();
  if (handle) {
    if (store.getRoot()) {
      await afterDirReady();
    } else {
      // 需要用户手势重新授权
      $('#restore-bar').style.display = 'flex';
      $('#restore-bar').dataset.ready = '1';
      window.__pendingHandle = handle;
    }
  }
}

function bindEvents() {
  $('#save-config').addEventListener('click', () => {
    CFG.token = $('#token').value.trim();
    CFG.model = $('#model').value;
    CFG.lang = $('#lang').value;
    CFG.proxy = $('#proxy').value.trim();
    CFG.aiUrl = $('#ai-url').value.trim();
    CFG.aiModel = $('#ai-model').value.trim();
    CFG.aiKey = $('#ai-key').value.trim();
    mineru.setProxy(CFG.proxy);
    agent.configure(CFG.aiUrl, CFG.aiModel, CFG.aiKey);
    toast('设置已保存', 'success');
  });

  $('#pick-dir').addEventListener('click', async () => {
    try {
      await store.pickDirectory();
      $('#restore-bar').style.display = 'none';
      await afterDirReady();
      toast('数据文件夹已就绪', 'success');
    } catch (e) {
      if (e.name !== 'AbortError') toast('选择文件夹失败：' + e.message, 'error');
    }
  });

  $('#restore-grant').addEventListener('click', async () => {
    const ok = await store.ensurePermission(window.__pendingHandle);
    if (ok) {
      $('#restore-bar').style.display = 'none';
      await afterDirReady();
      toast('已恢复历史数据', 'success');
    } else {
      toast('授权被拒绝', 'error');
    }
  });

  $('#upload-btn').addEventListener('click', () => $('#file-input').click());
  $('#file-input').addEventListener('change', onFilesSelected);

  // 拖拽上传
  const drop = $('#drop-zone');
  ['dragover', 'dragenter'].forEach((ev) =>
    drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((ev) =>
    drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', (e) => {
    const files = [...(e.dataTransfer?.files || [])].filter((f) => /\.pdf$/i.test(f.name));
    if (files.length) handleFiles(files);
  });

  $('#view-md').addEventListener('click', () => switchView('md'));
  $('#view-pdf').addEventListener('click', () => switchView('pdf'));

  // 对话面板
  $('#toggle-chat').addEventListener('click', () => {
    const open = $('#chat-panel').style.display === 'flex';
    $('#chat-panel').style.display = open ? 'none' : 'flex';
    $('#resizer-right').style.display = open ? 'none' : '';
  });
  $('#chat-close').addEventListener('click', () => {
    $('#chat-panel').style.display = 'none';
    $('#resizer-right').style.display = 'none';
  });
  $('#chat-clear').addEventListener('click', () => {
    agent.clearHistory();
    $('#chat-messages').innerHTML = '';
  });
  $('#chat-send').addEventListener('click', sendChatMessage);
  $('#chat-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage(); }
  });
}

async function afterDirReady() {
  $('#main').style.display = 'flex';
  $('#need-dir').style.display = 'none';
  await refreshPaperList();
}

window.addEventListener('DOMContentLoaded', init);

// ---------- 上传与解析 ----------
function onFilesSelected(e) {
  const files = [...(e.target.files || [])].filter((f) => /\.pdf$/i.test(f.name));
  e.target.value = '';
  if (files.length) handleFiles(files);
}

async function handleFiles(files) {
  if (!CFG.token) { toast('请先填写并保存 MinerU Token', 'error'); return; }
  if (!store.getRoot()) { toast('请先选择数据文件夹', 'error'); return; }
  for (const file of files) {
    // eslint-disable-next-line no-await-in-loop
    await processOne(file);
  }
}

async function processOne(file) {
  const paperId = uid();
  const meta = {
    id: paperId,
    title: file.name.replace(/\.pdf$/i, ''),
    fileName: file.name,
    model: CFG.model,
    language: CFG.lang,
    state: 'uploading',
    progress: 0,
    createdAt: Date.now(),
  };
  state.papers.unshift(meta);
  renderPaperList();
  selectPaper(paperId);

  try {
    // 先把原始 PDF 落地
    await store.savePdf(paperId, file);
    await store.saveMeta(paperId, meta);

    // 1. 申请上传链接
    updateMeta(paperId, { state: 'uploading', stateText: '申请上传链接...' });
    const { batchId, fileUrls } = await mineru.applyUpload(
      CFG.token,
      [{ name: file.name, data_id: paperId }],
      { model_version: CFG.model, language: CFG.lang },
    );
    updateMeta(paperId, { batchId });

    // 2. PUT 上传
    updateMeta(paperId, { stateText: '上传中...' });
    await mineru.uploadFile(fileUrls[0], file, (p) => {
      updateMeta(paperId, { progress: Math.round(p * 100), stateText: `上传中 ${Math.round(p * 100)}%` });
    });

    // 3. 轮询解析 + 下载结果（与刷新后恢复共用同一逻辑）
    updateMeta(paperId, { state: 'running', stateText: '已提交，等待解析...', progress: 0 });
    await resumeParsing(paperId);
  } catch (err) {
    console.error(err);
    updateMeta(paperId, { state: 'failed', stateText: err.message, error: err.message });
    toast('解析失败：' + err.message, 'error');
  }
}

// 轮询某篇论文的解析进度 → 下载 → 解压 → 标记完成。
// 既用于上传后的首次解析，也用于刷新页面后对未完成任务的续跟。
async function resumeParsing(paperId) {
  const m = state.papers.find((p) => p.id === paperId);
  if (!m || !m.batchId) return;
  try {
    const result = await mineru.pollUntilDone(
      CFG.token, m.batchId,
      (r) => r.data_id === paperId || r.file_name === m.fileName,
      {
        onUpdate(r) {
          const prog = r.extract_progress;
          let text = mineru.STATE_LABELS[r.state] || r.state;
          let pct = 0;
          if (prog && prog.total_pages) {
            pct = Math.round((prog.extracted_pages / prog.total_pages) * 100);
            text = `解析中 ${prog.extracted_pages}/${prog.total_pages} 页`;
          }
          updateMeta(paperId, { state: r.state, stateText: text, progress: pct });
        },
      },
    );

    updateMeta(paperId, { stateText: '下载结果...' });
    const buf = await mineru.downloadZip(result.full_zip_url);
    await extractZip(paperId, buf);

    updateMeta(paperId, { state: 'done', stateText: '已完成', progress: 100, doneAt: Date.now() });
    toast(`《${m.title}》解析完成`, 'success');
    if (state.currentId === paperId) await openPaper(paperId);
  } catch (err) {
    console.error(err);
    updateMeta(paperId, { state: 'failed', stateText: err.message, error: err.message });
    toast('解析失败：' + err.message, 'error');
  }
}

// 解压 zip：full.md 存为 markdown，其余作为资源
async function extractZip(paperId, arrayBuffer) {
  const zip = await window.JSZip.loadAsync(arrayBuffer);
  const entries = Object.values(zip.files);
  let mdName = null;
  // 优先 full.md
  if (zip.files['full.md']) mdName = 'full.md';
  else mdName = Object.keys(zip.files).find((n) => /\.md$/i.test(n));

  for (const entry of entries) {
    if (entry.dir) continue;
    if (entry.name === mdName) {
      const text = await entry.async('string');
      await store.saveMarkdown(paperId, text);
    } else {
      const blob = await entry.async('blob');
      await store.saveAsset(paperId, entry.name, blob);
    }
  }
}

// ---------- meta 更新与持久化 ----------
function updateMeta(paperId, patch) {
  const m = state.papers.find((p) => p.id === paperId);
  if (!m) return;
  Object.assign(m, patch);
  store.saveMeta(paperId, m).catch(() => {});
  renderPaperList();
  if (state.currentId === paperId) renderStatus(m);
}

// ---------- 历史列表 ----------
async function refreshPaperList() {
  try {
    state.papers = await store.listPapers();
  } catch {
    state.papers = [];
  }
  renderPaperList();
  if (!state.currentId && state.papers.length) {
    await openPaper(state.papers[0].id);
  }
  resumeUnfinished();
}

// 刷新/重开页面后，对仍未完成（且有 batchId）的论文重新发起轮询，
// 让进度继续更新，避免卡在旧状态。
function resumeUnfinished() {
  if (!CFG.token) return;
  const pending = state.papers.filter(
    (p) => p.batchId && !['done', 'failed'].includes(p.state),
  );
  for (const p of pending) {
    updateMeta(p.id, { stateText: '恢复进度跟踪...' });
    resumeParsing(p.id); // 不 await，多篇并行续跟
  }
}

function renderPaperList() {
  const ul = $('#paper-list');
  if (!state.papers.length) {
    ul.innerHTML = '<li class="empty">暂无论文，上传一个 PDF 开始</li>';
    return;
  }
  ul.innerHTML = state.papers.map((p) => {
    const active = p.id === state.currentId ? 'active' : '';
    const badge = stateBadge(p);
    return `<li class="paper-item ${active}" data-id="${p.id}">
      <div class="pi-title" title="${escapeHtml(p.title)}">${escapeHtml(p.title)}</div>
      <div class="pi-sub">${badge}<span class="pi-date">${fmtDate(p.createdAt)}</span></div>
      <button class="pi-del" data-del="${p.id}" title="删除">✕</button>
    </li>`;
  }).join('');

  ul.querySelectorAll('.paper-item').forEach((li) => {
    li.addEventListener('click', (e) => {
      if (e.target.dataset.del) return;
      openPaper(li.dataset.id);
    });
  });
  ul.querySelectorAll('[data-del]').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = btn.dataset.del;
      if (!confirm('确定删除这篇论文及其所有数据？')) return;
      await store.deletePaper(id);
      if (state.currentId === id) state.currentId = null;
      await refreshPaperList();
      toast('已删除', 'success');
    });
  });
}

function stateBadge(p) {
  const map = {
    done: ['done', '已完成'], failed: ['failed', '失败'],
    running: ['running', '解析中'], pending: ['running', '排队中'],
    uploading: ['running', '上传中'], converting: ['running', '转换中'],
  };
  const [cls, label] = map[p.state] || ['running', p.state || ''];
  return `<span class="badge ${cls}">${label}</span>`;
}

// ---------- 论文选择与预览 ----------
function selectPaper(id) {
  state.currentId = id;
  renderPaperList();
}

async function openPaper(id) {
  selectPaper(id);
  const m = state.papers.find((p) => p.id === id);
  if (!m) return;
  $('#viewer-title').textContent = m.title;
  renderStatus(m);

  // 渲染 markdown（若已完成）
  const mdBox = $('#md-view');
  const md = await store.loadMarkdown(id).catch(() => null);
  if (md) {
    await renderMarkdown(mdBox, md, id);
    agent.setContext(md); // 更新 AI 上下文
  } else {
    agent.setContext('');
    mdBox.innerHTML = m.state === 'failed'
      ? `<div class="placeholder error">解析失败：${escapeHtml(m.error || '')}</div>`
      : '<div class="placeholder">解析完成后将在此显示 Markdown 内容</div>';
  }

  // PDF 预览
  const pdfUrl = await store.getPdfUrl(id);
  const frame = $('#pdf-view');
  frame.src = pdfUrl || 'about:blank';

  switchView('md');
}

function renderStatus(m) {
  const bar = $('#status-bar');
  if (m.state === 'done') { bar.style.display = 'none'; return; }
  bar.style.display = 'flex';
  $('#status-text').textContent = m.stateText || (mineru.STATE_LABELS[m.state] || m.state);
  $('#status-fill').style.width = (m.progress || 0) + '%';
  bar.className = 'status-bar ' + (m.state === 'failed' ? 'failed' : '');
}

function switchView(which) {
  $('#md-view').style.display = which === 'md' ? 'block' : 'none';
  $('#pdf-wrap').style.display = which === 'pdf' ? 'block' : 'none';
  $('#view-md').classList.toggle('active', which === 'md');
  $('#view-pdf').classList.toggle('active', which === 'pdf');
}

// ---------- 工具 ----------
function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function fmtDate(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// ---------- 对话面板 ----------
function appendChatMsg(role, text) {
  const box = $('#chat-messages');
  const div = document.createElement('div');
  div.className = `chat-msg ${role}`;
  div.innerHTML = `<div class="chat-bubble">${escapeHtml(text)}</div>`;
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
  return div.querySelector('.chat-bubble');
}

let chatBusy = false;

async function sendChatMessage() {
  if (chatBusy) return;
  const input = $('#chat-input');
  const msg = input.value.trim();
  if (!msg) return;
  input.value = '';

  appendChatMsg('user', msg);
  const bubble = appendChatMsg('assistant', '');
  bubble.textContent = '▌';
  chatBusy = true;
  $('#chat-send').disabled = true;

  let reply = '';
  try {
    await agent.chat(msg, (chunk) => {
      reply += chunk;
      bubble.innerHTML = (window.marked ? window.marked.parse(reply) : escapeHtml(reply)) + '<span class="cursor">▌</span>';
      $('#chat-messages').scrollTop = $('#chat-messages').scrollHeight;
    });
    bubble.innerHTML = window.marked ? window.marked.parse(reply) : escapeHtml(reply);
  } catch (e) {
    bubble.closest('.chat-msg').classList.add('error');
    bubble.textContent = e.message;
  } finally {
    chatBusy = false;
    $('#chat-send').disabled = false;
  }
}

// ---------- 分隔条拖拽 ----------
function initResizer(resizerId, getTarget, startSizeFn) {
  const resizer = document.getElementById(resizerId);
  resizer.addEventListener('mousedown', (e) => {
    e.preventDefault();
    const target = getTarget();
    const startX = e.clientX;
    const startSize = startSizeFn(target);
    resizer.classList.add('dragging');
    const onMove = (ev) => {
      const newSize = Math.max(140, startSize + (ev.clientX - startX));
      target.style.width = newSize + 'px';
      target.style.flex = 'none';
    };
    const onUp = () => {
      resizer.classList.remove('dragging');
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}

window.addEventListener('DOMContentLoaded', () => {
  initResizer('resizer-left',
    () => document.querySelector('.sidebar'),
    (el) => el.getBoundingClientRect().width
  );
  initResizer('resizer-right',
    () => document.getElementById('chat-panel'),
    (el) => el.getBoundingClientRect().width
  );
});
