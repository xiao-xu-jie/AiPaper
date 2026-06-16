<template>
  <aside class="sidebar" :style="{ width: width + 'px' }">
    <div class="sidebar-head">
      <span>论文库</span>
      <button class="btn-icon" title="新建目录" @click="createFolder('root')">＋</button>
    </div>
    <div class="tree-wrap">
      <FolderNode node-id="root" :depth="0" />
    </div>
  </aside>
  <div class="resizer" :class="{ dragging }" @mousedown="startDrag" />

  <!-- 重命名弹窗 -->
  <Teleport to="body">
    <div v-if="renameTarget" class="folder-dialog-backdrop" @click="renameTarget = null">
      <div class="folder-dialog" @click.stop>
        <div class="fd-title">重命名目录</div>
        <input ref="renameInput" v-model="renameDraft" class="fd-input" @keydown.enter="commitRename" @keydown.esc="renameTarget = null" />
        <div class="fd-actions">
          <button class="btn small" @click="renameTarget = null">取消</button>
          <button class="btn small primary" @click="commitRename">确认</button>
        </div>
      </div>
    </div>
  </Teleport>

  <!-- 右键菜单 -->
  <Teleport to="body">
    <div v-if="ctx.show" class="ctx-menu" :style="{ left: ctx.x + 'px', top: ctx.y + 'px' }" @click.stop>
      <button v-if="ctx.type === 'folder'" @click="createFolder(ctx.id)">新建子目录</button>
      <button v-if="ctx.type === 'folder' && ctx.id !== 'root'" @click="startRename(ctx.id)">重命名</button>
      <button v-if="ctx.type === 'folder' && ctx.id !== 'root'" class="danger" @click="delFolder(ctx.id)">删除目录</button>
      <template v-if="ctx.type === 'paper'">
        <button @click="showMoveMenu = true">移动到目录</button>
        <button class="danger" @click="delPaper(ctx.id)">删除论文</button>
      </template>
    </div>
    <div v-if="ctx.show" class="ctx-backdrop" @click="ctx.show = false" @contextmenu.prevent="ctx.show = false" />

    <!-- 移动到目录子菜单 -->
    <div v-if="ctx.show && showMoveMenu" class="ctx-menu move-menu" :style="{ left: ctx.x + 120 + 'px', top: ctx.y + 'px' }">
      <button v-for="f in allFolders" :key="f.id" @click="movePaper(ctx.id, f.id)">{{ f.name }}</button>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, computed, nextTick, provide } from 'vue';
import { usePapersStore } from '../stores/papers.js';
import { useFoldersStore } from '../stores/folders.js';
import FolderNode from './FolderNode.vue';

const papers = usePapersStore();
const folders = useFoldersStore();
const width = ref(280);
const dragging = ref(false);

// 右键菜单
const ctx = ref({ show: false, x: 0, y: 0, id: '', type: '' });
const showMoveMenu = ref(false);
const renameTarget = ref(null);
const renameDraft = ref('');
const renameInput = ref(null);

const allFolders = computed(() => Object.values(folders.tree));

function startDrag(e) {
  e.preventDefault();
  const startX = e.clientX, startW = width.value;
  dragging.value = true;
  const onMove = (ev) => { width.value = Math.max(140, startW + (ev.clientX - startX)); };
  const onUp = () => { dragging.value = false; document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}

function openCtx(e, id, type) {
  ctx.value = { show: true, x: e.clientX, y: e.clientY, id, type };
  showMoveMenu.value = false;
}

async function createFolder(parentId) {
  ctx.value.show = false;
  const name = prompt('新目录名称：');
  if (!name?.trim()) return;
  const id = await folders.createFolder(parentId, name.trim());
  folders.activeFolderId = id;
}

function startRename(id) {
  ctx.value.show = false;
  renameDraft.value = folders.tree[id]?.name || '';
  renameTarget.value = id;
  nextTick(() => renameInput.value?.focus());
}

async function commitRename() {
  if (renameTarget.value && renameDraft.value.trim()) {
    await folders.renameFolder(renameTarget.value, renameDraft.value.trim());
  }
  renameTarget.value = null;
}

async function delFolder(id) {
  ctx.value.show = false;
  if (!confirm(`删除目录「${folders.tree[id]?.name}」？其中的论文将移回根目录。`)) return;
  await folders.deleteFolder(id);
}

async function delPaper(id) {
  ctx.value.show = false;
  if (!confirm('确定删除这篇论文及其所有数据？')) return;
  await papers.delete(id);
}

async function movePaper(paperId, folderId) {
  ctx.value.show = false;
  showMoveMenu.value = false;
  await folders.movePaper(paperId, folderId);
}

// 提供给子组件 FolderNode 的上下文
provide('openCtx', openCtx);
provide('papers', papers);
provide('folders', folders);
</script>

<style scoped>
.sidebar {
  background: var(--panel);
  display: flex; flex-direction: column;
  overflow: hidden; flex-shrink: 0; min-width: 140px;
}
.sidebar-head {
  padding: 12px 16px; font-weight: 600; font-size: 14px;
  border-bottom: 1px solid var(--border);
  display: flex; align-items: center; justify-content: space-between;
}
.btn-icon { border: none; background: transparent; cursor: pointer; font-size: 18px; color: var(--muted); padding: 0 4px; line-height: 1; }
.btn-icon:hover { color: var(--primary); }
.tree-wrap { flex: 1; overflow-y: auto; }
.resizer { width: 5px; flex-shrink: 0; background: var(--border); cursor: col-resize; transition: background .15s; }
.resizer:hover, .resizer.dragging { background: var(--primary); }

/* 右键菜单 */
.ctx-menu {
  position: fixed; z-index: 500; background: var(--panel);
  border: 1px solid var(--border); border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0,0,0,.12); overflow: hidden; min-width: 120px;
}
.ctx-menu button {
  display: block; width: 100%; padding: 9px 14px; border: none;
  background: transparent; text-align: left; cursor: pointer; font-size: 13px; color: var(--text);
}
.ctx-menu button:hover { background: #f0f1f3; }
.ctx-menu button.danger:hover { background: #fce8e8; color: var(--red); }
.ctx-backdrop { position: fixed; inset: 0; z-index: 499; }
.move-menu { min-width: 140px; }

/* 重命名弹窗 */
.folder-dialog-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,.4); display: flex; align-items: center; justify-content: center; z-index: 600; }
.folder-dialog { background: #fff; border-radius: 10px; padding: 20px; width: 300px; display: flex; flex-direction: column; gap: 12px; }
.fd-title { font-weight: 600; font-size: 15px; }
.fd-input { border: 1px solid var(--border); border-radius: 7px; padding: 8px 12px; font-size: 14px; outline: none; }
.fd-input:focus { border-color: var(--primary); }
.fd-actions { display: flex; gap: 8px; justify-content: flex-end; }
</style>
