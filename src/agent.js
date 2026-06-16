// agent.js —— OpenAI 兼容接口的流式对话客户端
// 配置由 app.js 通过 configure() 传入，历史记录在切换论文时重置

let cfg = { url: '', model: '', key: '' };
let history = [];   // { role, content }[]
let paperMd = '';   // 当前论文 Markdown，作为 system 上下文

export function configure(url, model, key) {
  cfg = { url: url.replace(/\/$/, ''), model, key };
}

export function setContext(md) {
  paperMd = md || '';
  history = [];
}

export function clearHistory() {
  history = [];
}

export async function chat(userMsg, onChunk) {
  if (!cfg.url || !cfg.model) throw new Error('请先填写并保存 AI 接口地址和模型名称');

  history.push({ role: 'user', content: userMsg });

  const systemContent = paperMd
    ? `你是一个论文阅读助手。以下是当前论文的完整内容（Markdown 格式），请基于此内容回答用户问题：\n\n${paperMd}`
    : '你是一个学术助手，请帮助用户理解和分析论文内容。';

  const res = await fetch(`${cfg.url}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(cfg.key ? { Authorization: `Bearer ${cfg.key}` } : {}),
    },
    body: JSON.stringify({
      model: cfg.model,
      stream: true,
      messages: [{ role: 'system', content: systemContent }, ...history],
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => '');
    history.pop();
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
    buf = lines.pop(); // 保留不完整行
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (data === '[DONE]') continue;
      try {
        const delta = JSON.parse(data).choices?.[0]?.delta?.content || '';
        if (delta) { assistantMsg += delta; onChunk(delta); }
      } catch { /* 跳过无法解析的行 */ }
    }
  }

  history.push({ role: 'assistant', content: assistantMsg });
}
