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
