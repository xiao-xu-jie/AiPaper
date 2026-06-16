// mineru.js —— MinerU 精准解析 API 客户端（浏览器端）
// 流程：申请上传链接(file-urls/batch) → PUT 直传文件 → 轮询批量结果 → 下载结果 zip
//
// CORS 说明：若直连被浏览器拦截，可设置代理前缀（见 setProxy），
// 请求会改为 <proxy>/https://mineru.net/... 形式，由本地代理转发。

const API_BASE = 'https://mineru.net/api/v4';

let proxyPrefix = ''; // 例如 'http://localhost:8788/proxy?url='

export function setProxy(prefix) {
  proxyPrefix = prefix || '';
}

function wrap(url) {
  return proxyPrefix ? proxyPrefix + encodeURIComponent(url) : url;
}

function authHeaders(token) {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

// 把 MinerU 业务错误转成可读异常
function checkCode(json) {
  if (json.code !== 0) {
    const map = {
      A0202: 'Token 错误，请检查令牌是否正确',
      A0211: 'Token 已过期，请更换新令牌',
      '-60005': '文件大小超出限制（最大 200MB）',
      '-60006': '文件页数超出限制（最大 200 页）',
      '-60018': '今日解析额度已用尽，请明日再试',
    };
    const hint = map[json.code] || json.msg || '未知错误';
    throw new Error(`MinerU 错误 [${json.code}]：${hint}`);
  }
  return json;
}

// 1. 申请批量上传链接
//    files: [{ name, data_id, is_ocr?, page_ranges? }]
//    opts:  { model_version, enable_formula, enable_table, language, extra_formats }
export async function applyUpload(token, files, opts = {}) {
  const body = {
    files,
    model_version: opts.model_version || 'vlm',
    enable_formula: opts.enable_formula !== false,
    enable_table: opts.enable_table !== false,
    language: opts.language || 'ch',
    ...(opts.extra_formats ? { extra_formats: opts.extra_formats } : {}),
  };
  const res = await fetch(wrap(`${API_BASE}/file-urls/batch`), {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`申请上传链接失败：HTTP ${res.status}`);
  const json = checkCode(await res.json());
  return { batchId: json.data.batch_id, fileUrls: json.data.file_urls };
}

// 2. PUT 直传文件到返回的链接。
//    OSS 签名上传接口通常不返回 CORS 头，浏览器直连会被拦截，
//    因此【配了代理时优先走代理】；未配代理才尝试直连。
export async function uploadFile(uploadUrl, fileBlob, onProgress) {
  if (proxyPrefix) {
    await putOnce(wrap(uploadUrl), fileBlob, onProgress); // 经代理上传
  } else {
    await putOnce(uploadUrl, fileBlob, onProgress); // 直连（需 OSS 开放 CORS）
  }
}

// 单次 PUT，用 XHR 以便拿到上传进度。
// 注意：不显式设置 Content-Type —— MinerU 要求 OSS 上传不带该头。
function putOnce(url, fileBlob, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    if (xhr.upload && onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(e.loaded / e.total);
      };
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`文件上传失败：HTTP ${xhr.status}`));
    };
    xhr.onerror = () => reject(new Error('文件上传网络错误（可能为 CORS 限制，请确认代理已启动并已填写代理前缀）'));
    // 发送 Blob，但强制让浏览器不附带 application/pdf 这类 Content-Type
    xhr.send(new Blob([fileBlob]));
  });
}

// 3. 查询批量解析结果
//    返回 data.extract_result[]，每项含 file_name/state/full_zip_url/extract_progress
export async function queryBatch(token, batchId) {
  const res = await fetch(wrap(`${API_BASE}/extract-results/batch/${batchId}`), {
    method: 'GET',
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error(`查询结果失败：HTTP ${res.status}`);
  const json = checkCode(await res.json());
  return json.data.extract_result || [];
}

// 轮询单个文件（按 data_id 或文件名匹配）直到 done/failed
//   onUpdate(result) 每次轮询回调，可用于更新进度
export async function pollUntilDone(token, batchId, matcher, { interval = 3000, timeout = 600000, onUpdate } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const results = await queryBatch(token, batchId);
    const item = results.find(matcher) || results[0];
    if (item) {
      if (onUpdate) onUpdate(item);
      if (item.state === 'done') return item;
      if (item.state === 'failed') {
        throw new Error(`解析失败：${item.err_msg || '未知原因'}`);
      }
    }
    await new Promise((r) => setTimeout(r, interval));
  }
  throw new Error('解析轮询超时');
}

// 4. 下载结果 zip，返回 ArrayBuffer
export async function downloadZip(zipUrl) {
  const res = await fetch(wrap(zipUrl));
  if (!res.ok) throw new Error(`下载结果失败：HTTP ${res.status}`);
  return res.arrayBuffer();
}

export const STATE_LABELS = {
  'waiting-file': '等待文件上传',
  pending: '排队中',
  running: '正在解析',
  converting: '格式转换中',
  done: '已完成',
  failed: '解析失败',
};
