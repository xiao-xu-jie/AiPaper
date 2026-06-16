// agent.js —— OpenAI 兼容接口的流式对话客户端（history 由外部管理）

let cfg = { url: '', model: '', key: '' };
let paperMd = '';

export function configure(url, model, key) {
  cfg = { url: url.replace(/\/$/, ''), model, key };
}

export function setContext(md) {
  paperMd = md || '';
}

// history: {role, content}[]，不含 system；返回 assistant 回复字符串
export async function chat(history, userMsg, images = [], onChunk) {
  if (!cfg.url || !cfg.model) throw new Error('请先填写并保存 AI 接口地址和模型名称');

  const userContent = images.length
    ? [
        { type: 'text', text: userMsg || ' ' },
        ...images.map((b64) => ({ type: 'image_url', image_url: { url: b64 } })),
      ]
    : userMsg;

  const systemContent = paperMd
    ? `你是一个论文阅读助手。以下是当前论文的完整内容（Markdown 格式），请基于此内容回答用户问题：\n\n${paperMd}`
    : '你是一个学术助手，请帮助用户理解和分析论文内容。';

  const messages = [
    { role: 'system', content: systemContent },
    ...history,
    { role: 'user', content: userContent },
  ];

  const res = await fetch(`${cfg.url}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(cfg.key ? { Authorization: `Bearer ${cfg.key}` } : {}),
    },
    body: JSON.stringify({ model: cfg.model, stream: true, messages }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`API 错误 ${res.status}${err ? '：' + err.slice(0, 120) : ''}`);
  }

  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let assistantMsg = '';
  let buf = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop();
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (data === '[DONE]') continue;
      try {
        const delta = JSON.parse(data).choices?.[0]?.delta?.content || '';
        if (delta) { assistantMsg += delta; onChunk(delta); }
      } catch { /* noop */ }
    }
  }

  return assistantMsg;
}
