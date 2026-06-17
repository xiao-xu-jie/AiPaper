<template>
  <header class="topbar">
    <div class="brand">
      <img src="/assets/logo.png" alt="AI Paper" class="logo" />
      <span class="title">AI Paper</span>
      <span class="subtitle">MinerU 在线解析</span>
    </div>
    <button class="btn secondary" @click="showHelp = true">❓ 帮助</button>
    <button class="btn primary" @click="$emit('upload')">＋ 上传 PDF</button>
  </header>

  <Teleport to="body">
    <div v-if="showHelp" class="help-overlay" @click="showHelp = false">
      <div class="help-modal" @click.stop>
        <div class="help-header">
          <h2>使用指南</h2>
          <button class="close-btn" @click="showHelp = false">✕</button>
        </div>
        <div class="help-content">
          <section>
            <h3>1️⃣ 配置 MinerU Token</h3>
            <p>用于 PDF 解析服务</p>
            <ol>
              <li>点击 MinerU Token 输入框右侧的 🔗 按钮</li>
              <li>在打开的页面注册/登录 mineru.net</li>
              <li>进入 API 管理页面创建 Token</li>
              <li>复制 Token 粘贴到输入框中</li>
            </ol>
          </section>

          <section>
            <h3>2️⃣ 配置 AI 接口（可选）</h3>
            <p>用于 AI 助手对话和自动生成笔记</p>
            <ul>
              <li><strong>AI 接口地址</strong>：OpenAI 兼容的 API 地址，例如：
                <code>https://api.openai.com/v1</code>
              </li>
              <li><strong>AI 密钥</strong>：对应服务的 API Key</li>
              <li><strong>AI 模型</strong>：配置好接口后点击刷新按钮自动获取模型列表，或手动输入模型名称（如 <code>gpt-4o</code>）</li>
            </ul>
          </section>

          <section>
            <h3>3️⃣ 选择数据文件夹</h3>
            <p>点击「📁 选择数据文件夹」按钮，选择一个本地文件夹用于存储：</p>
            <ul>
              <li>上传的 PDF 原文</li>
              <li>解析后的 Markdown 内容</li>
              <li>提取的图片资源</li>
              <li>阅读笔记和对话记录</li>
            </ul>
          </section>

          <section>
            <h3>4️⃣ 开始使用</h3>
            <ol>
              <li><strong>上传 PDF</strong>：点击「＋ 上传 PDF」或拖拽文件到页面</li>
              <li><strong>查看内容</strong>：解析完成后可切换 Markdown、原文 PDF、阅读笔记三个标签页</li>
              <li><strong>AI 助手</strong>：点击「💬 AI 助手」或右键选中内容/图片快捷提问</li>
              <li><strong>生成笔记</strong>：切换到阅读笔记标签页，点击「✨ AI 生成笔记」</li>
            </ol>
          </section>

          <section>
            <h3>💡 提示</h3>
            <ul>
              <li>所有数据保存在本地，下次打开自动恢复</li>
              <li>Markdown 和笔记支持图片点击预览、右键复制</li>
              <li>支持查看大纲目录，点击快速跳转</li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref } from 'vue';
defineEmits(['upload']);
const showHelp = ref(false);
</script>

<style scoped>
.topbar {
  display: flex; align-items: center; gap: 16px;
  padding: 12px 20px;
  background: var(--panel);
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}
.brand { display: flex; align-items: center; gap: 8px; }
.logo { height: 28px; width: auto; }
.title { font-size: 18px; font-weight: 700; }
.subtitle { font-size: 13px; font-weight: 400; color: var(--muted); }
.topbar .btn { margin-left: 8px; }
.topbar .btn.primary { margin-left: auto; }
.help-overlay {
  position: fixed; inset: 0; z-index: 1000;
  background: rgba(0, 0, 0, 0.5);
  display: flex; align-items: center; justify-content: center;
  padding: 20px;
}
.help-modal {
  background: #fff; border-radius: 12px; box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  max-width: 700px; width: 100%; max-height: 85vh;
  display: flex; flex-direction: column;
}
.help-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 20px 24px; border-bottom: 1px solid var(--border);
}
.help-header h2 { margin: 0; font-size: 20px; }
.close-btn {
  border: none; background: transparent; font-size: 24px;
  cursor: pointer; padding: 4px 8px; border-radius: 6px;
  transition: background .15s;
}
.close-btn:hover { background: #f0f1f3; }
.help-content {
  overflow-y: auto; padding: 24px;
  line-height: 1.6;
}
.help-content section {
  margin-bottom: 24px;
}
.help-content section:last-child { margin-bottom: 0; }
.help-content h3 {
  font-size: 16px; margin: 0 0 12px 0;
  color: var(--primary);
}
.help-content p {
  margin: 0 0 8px 0; color: var(--muted); font-size: 14px;
}
.help-content ol, .help-content ul {
  margin: 8px 0; padding-left: 24px;
}
.help-content li {
  margin: 6px 0; font-size: 14px;
}
.help-content code {
  background: #f0f1f3; padding: 2px 6px; border-radius: 4px;
  font-family: "SF Mono", Consolas, monospace; font-size: 13px;
}
.help-content strong { color: var(--text); }
</style>
