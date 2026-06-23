const STORAGE_KEY = 'siyuan_config';

export function loadConfig() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return {
      endpoint: saved.endpoint || 'http://127.0.0.1:6806',
      token: saved.token || '',
      notebook: saved.notebook || '',
      assetsDirPath: saved.assetsDirPath || '/assets/',
      defaultPath: saved.defaultPath || '/AI Paper',
    };
  } catch {
    return {
      endpoint: 'http://127.0.0.1:6806',
      token: '',
      notebook: '',
      assetsDirPath: '/assets/',
      defaultPath: '/AI Paper',
    };
  }
}

export function saveConfig(config) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    endpoint: normalizeEndpoint(config.endpoint),
    token: config.token || '',
    notebook: config.notebook || '',
    assetsDirPath: normalizeAssetPath(config.assetsDirPath),
    defaultPath: normalizeDocPath(config.defaultPath || '/AI Paper'),
  }));
}

export function normalizeEndpoint(endpoint) {
  return String(endpoint || 'http://127.0.0.1:6806').trim().replace(/\/$/, '');
}

export function normalizeDocPath(path) {
  const text = String(path || '').trim() || '/AI Paper';
  return text.startsWith('/') ? text : `/${text}`;
}

export function normalizeAssetPath(path) {
  let text = String(path || '').trim() || '/assets/';
  if (!text.startsWith('/')) text = `/${text}`;
  if (!text.endsWith('/')) text = `${text}/`;
  return text;
}

function getProxyUrl(url) {
  if (typeof window === 'undefined') return url;
  if (window.location.protocol === 'file:') return url;
  return `${window.location.origin}/proxy?url=${encodeURIComponent(url)}`;
}

async function request(config, path, body = {}) {
  const endpoint = normalizeEndpoint(config.endpoint);
  const res = await fetch(getProxyUrl(`${endpoint}${path}`), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(config.token ? { Authorization: `Token ${config.token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || data?.code) {
    throw new Error(data?.msg || `思源接口请求失败 (${res.status})`);
  }
  return data?.data;
}

export async function getVersion(config) {
  return request(config, '/api/system/version');
}

export async function listNotebooks(config) {
  const data = await request(config, '/api/notebook/lsNotebooks');
  return data?.notebooks || [];
}

export async function createDocWithMd(config, notebook, path, markdown) {
  return request(config, '/api/filetree/createDocWithMd', {
    notebook,
    path: normalizeDocPath(path),
    markdown,
  });
}

export async function setBlockAttrs(config, id, attrs) {
  return request(config, '/api/attr/setBlockAttrs', { id, attrs });
}

export async function uploadAsset(config, assetsDirPath, file) {
  const endpoint = normalizeEndpoint(config.endpoint);
  const form = new FormData();
  form.append('assetsDirPath', normalizeAssetPath(assetsDirPath));
  form.append('file[]', file, file.name);
  const res = await fetch(getProxyUrl(`${endpoint}/api/asset/upload`), {
    method: 'POST',
    headers: {
      ...(config.token ? { Authorization: `Token ${config.token}` } : {}),
    },
    body: form,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || data?.code) {
    throw new Error(data?.msg || `思源资源上传失败 (${res.status})`);
  }
  return data?.data?.succMap?.[file.name] || null;
}

export function sanitizeTitle(title) {
  return String(title || '阅读笔记').replace(/[\\/:*?"<>|#\[\]]/g, ' ').replace(/\s+/g, ' ').trim() || '阅读笔记';
}

export function buildDefaultMetadata(paper) {
  if (!paper) return [];
  return [
    { key: 'paper-id', value: paper.id || '' },
    { key: 'paper-title', value: paper.title || '' },
    { key: 'paper-tags', value: (paper.tags || []).join(', ') },
    { key: 'uploaded-at', value: paper.uploadedAt ? new Date(paper.uploadedAt).toISOString() : '' },
  ].filter((row) => row.value);
}

export function buildAttrs(metadata = []) {
  const attrs = {
    'custom-aipaper-synced-at': new Date().toISOString(),
  };
  for (const row of metadata) {
    const key = String(row?.key || '').trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-|-$/g, '');
    const value = String(row?.value || '').trim();
    if (!key || !value) continue;
    attrs[`custom-aipaper-${key}`] = value;
  }
  return attrs;
}

export function parentDocPath(path) {
  const normalized = normalizeDocPath(path);
  const parts = normalized.split('/').filter(Boolean);
  parts.pop();
  return parts.length ? `/${parts.join('/')}` : '/AI Paper';
}

// 将笔记中的本地图片上传到思源资源目录，并重写引用
export async function rewriteNoteAssets(markdown, paperId, config, loadBlob) {
  const imagePattern = /!\[([^\]]*)\]\(([^)]+)\)/g;
  const replacements = new Map();
  const matches = [...markdown.matchAll(imagePattern)];
  for (const match of matches) {
    const src = match[2].trim();
    if (/^(https?:|data:|blob:|assets\/)/i.test(src) || replacements.has(src)) continue;
    const rel = src.replace(/^\.?\//, '');
    try {
      const file = await loadBlob(paperId, rel);
      const uploadedPath = await uploadAsset(config, config.assetsDirPath, file);
      if (uploadedPath) replacements.set(src, uploadedPath);
    } catch {
      // 单张图片失败时保留原引用，避免阻断整篇笔记上传
    }
  }
  return markdown.replace(imagePattern, (full, alt, src) => {
    const next = replacements.get(src.trim());
    return next ? `![${alt}](${next})` : full;
  });
}

/**
 * 上传一篇论文的阅读笔记到思源
 * @param {object} options
 * @param {object} options.config - 思源配置（endpoint/token/notebook/assetsDirPath）
 * @param {string} options.notebook - 笔记本 ID
 * @param {string} options.docPath - 思源文档路径
 * @param {string} options.title - 文档标题
 * @param {string} options.markdown - Markdown 内容
 * @param {string} options.paperId - 论文 ID（用于解析本地资源）
 * @param {Array}  options.metadata - [{key, value}] 元数据
 * @param {Function} options.loadBlob - (paperId, relPath) => Promise<Blob>
 * @param {Function} [options.onProgress] - 进度回调
 * @returns {Promise<string>} 创建的文档 ID
 */
export async function uploadPaperNote(options) {
  const {
    config, notebook, docPath, title, markdown,
    paperId, metadata = [], loadBlob, onProgress,
  } = options;
  if (!notebook) throw new Error('请先选择思源笔记本');
  if (!markdown?.trim()) throw new Error('当前论文还没有阅读笔记');

  onProgress?.('上传资源文件...');
  const rewritten = await rewriteNoteAssets(markdown, paperId, config, loadBlob);
  const finalMarkdown = `# ${title}\n\n${rewritten}`;

  onProgress?.('创建思源文档...');
  const docId = await createDocWithMd(config, notebook, docPath, finalMarkdown);

  onProgress?.('写入元数据...');
  await setBlockAttrs(config, docId, buildAttrs(metadata));

  return docId;
}
