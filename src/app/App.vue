<script setup lang="ts">
/**
 * 文件浏览器主页面。
 * - 通过 /api/files 加载当前目录列表(文件夹在前、文件在后,均按名称排序);
 * - 支持进入目录、返回上级、多选与批量下载;
 * - 底部固定操作栏:批量下载 + 上传入口(右侧上传面板)。
 */
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import UploadPanel from './components/UploadPanel.vue';
import { formatSize, formatTime } from './utils/format';
import { t } from './i18n';
import type { FileItem, FileListResponse } from './types';

// Vant ConfigProvider 深浅色主题:跟随系统偏好
const themeMedia = window.matchMedia('(prefers-color-scheme: dark)');
const isDark = ref(themeMedia.matches);

/**
 * 系统深浅色主题切换回调,同步到界面。
 * @param e 媒体查询变化事件
 */
function onThemeChange(e: MediaQueryListEvent) {
  isDark.value = e.matches;
}
// 监听主题变化,并在组件卸载时移除监听
themeMedia.addEventListener('change', onThemeChange);
onBeforeUnmount(() => themeMedia.removeEventListener('change', onThemeChange));

// 文件列表状态:当前路径、上级路径、条目、选中项、加载中、上传面板开关、错误信息
const currentPath = ref('.');
const parentPath = ref<string | null>(null);
const items = ref<FileItem[]>([]);
const selected = ref<Set<string>>(new Set());
const loading = ref(false);
const showUpload = ref(false);
const error = ref('');

// 已选中条目数;存在选中项时才允许批量下载
const selectedCount = computed(() => selected.value.size);
const canDownload = computed(() => selectedCount.value > 0);

/**
 * 加载指定目录的文件列表。
 * 成功后刷新当前路径 / 上级路径 / 条目,并清空选中项;失败时展示错误信息。
 * @param dir 目标目录,相对服务根目录,如 '.' 或 'docs'
 */
async function loadFiles(dir: string) {
  loading.value = true;
  error.value = '';
  try {
    // 请求文件列表接口,失败时优先展示接口返回的错误码文案
    const resp = await fetch(`/api/files?dir=${encodeURIComponent(dir)}`);
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      if (data.code) throw new Error(t(data.code));
      throw new Error(data.error || t('load.failed', { code: resp.status }));
    }
    const data = (await resp.json()) as FileListResponse;
    currentPath.value = data.currentPath;
    parentPath.value = data.parentPath;
    items.value = data.items;
    selected.value = new Set();
  } catch (err: any) {
    error.value = err.message;
  } finally {
    loading.value = false;
  }
}

/** 返回上级目录(存在上级时重新加载列表) */
function goParent() {
  if (parentPath.value) loadFiles(parentPath.value);
}

/**
 * 打开条目:目录则进入该目录,文件则触发浏览器下载。
 * @param item 文件列表条目
 */
function openItem(item: FileItem) {
  if (item.isDirectory) {
    loadFiles(item.path);
  } else {
    // 构造带编码的下载地址,用隐藏 <a> 触发下载
    const url = `/api/download/${item.path.split('/').map(encodeURIComponent).join('/')}`;
    const a = document.createElement('a');
    a.href = url;
    a.download = item.name;
    a.click();
  }
}

/**
 * 切换条目的选中状态。
 * @param item 文件列表条目
 */
function toggleSelect(item: FileItem) {
  // 以新 Set 替换旧值,触发响应式更新
  const s = new Set(selected.value);
  if (s.has(item.path)) s.delete(item.path);
  else s.add(item.path);
  selected.value = s;
}

/** 批量下载选中的文件/目录(服务端打包为 zip 后触发浏览器下载) */
async function downloadBatch() {
  if (selectedCount.value === 0) return;
  const paths = Array.from(selected.value);
  try {
    const resp = await fetch('/api/download-batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ files: paths }),
    });
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      if (data.code) throw new Error(t(data.code));
      throw new Error(data.error || t('download.failed', { code: resp.status }));
    }
    // 以 blob 对象 URL 触发 zip 下载,用后立即释放
    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'files.zip';
    a.click();
    URL.revokeObjectURL(url);
  } catch (err: any) {
    error.value = err.message;
  }
}

/** 上传完成回调:重新加载当前目录,刷新文件列表 */
function onUploaded() {
  loadFiles(currentPath.value);
}

onMounted(() => loadFiles('.'));
</script>

<template>
  <van-config-provider :theme="isDark ? 'dark' : 'light'" tag="div">
    <div class="browser">
      <header class="browser__header">
        <h1 class="browser__title">file-serve</h1>
        <div class="browser__path" :title="currentPath">{{ currentPath }}</div>
      </header>

      <div class="browser__body">
        <div v-if="error" class="browser__error">{{ error }}</div>

        <div class="file-list">
          <div v-if="parentPath" class="file-row file-row--parent" @click="goParent">
            <span class="file-row__checkbox">
              <span class="file-row__icon file-row__icon--parent">📂</span>
            </span>
            <span class="file-row__name">..</span>
            <span class="file-row__meta"></span>
            <span class="file-row__meta file-row__meta--time"></span>
          </div>

          <div v-for="item in items" :key="item.path" class="file-row" @click="openItem(item)">
            <span class="file-row__checkbox" @click.stop>
              <input
                type="checkbox"
                :checked="selected.has(item.path)"
                class="file-row__check"
                @change="toggleSelect(item)"
              />
            </span>
            <span class="file-row__icon">{{ item.isDirectory ? '📁' : '📄' }}</span>
            <span class="file-row__name" :title="item.name">{{ item.name }}</span>
            <span v-if="!item.isDirectory" class="file-row__meta">{{ formatSize(item.size) }}</span>
            <span class="file-row__meta file-row__meta--time">{{ formatTime(item.mtime) }}</span>
          </div>

          <div v-if="!loading && items.length === 0" class="file-list__empty">
            {{ t('empty.dir') }}
          </div>
        </div>
      </div>

      <footer class="browser__footer">
        <span class="browser__selected">{{ t('selected.count', { n: selectedCount }) }}</span>
        <div class="browser__actions">
          <van-button
            size="small"
            type="primary"
            plain
            :disabled="!canDownload"
            @click="downloadBatch"
          >
            {{ t('action.download') }}
          </van-button>
          <van-button size="small" type="primary" @click="showUpload = true">
            {{ t('action.upload') }}
          </van-button>
        </div>
      </footer>

      <UploadPanel v-model="showUpload" @uploaded="onUploaded" />
    </div>
  </van-config-provider>
</template>

<style scoped>
.browser {
  max-width: 960px;
  margin: 0 auto;
  min-height: 100vh;
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  padding: 0 16px;
  padding-left: max(16px, env(safe-area-inset-left));
  padding-right: max(16px, env(safe-area-inset-right));
}

.browser__header {
  padding: 24px 4px 16px;
  padding-top: max(24px, env(safe-area-inset-top));
  display: flex;
  align-items: baseline;
  gap: 16px;
}

.browser__title {
  margin: 0;
  font-size: 24px;
  font-weight: 700;
  color: var(--fs-primary);
}

.browser__path {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--fs-text-secondary);
  font-size: 13px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}

.browser__body {
  flex: 1;
  padding-bottom: 96px;
}

.browser__error {
  padding: 12px;
  margin-bottom: 12px;
  border-radius: 6px;
  background: rgba(250, 44, 25, 0.08);
  color: var(--fs-primary);
  font-size: 13px;
}

.file-list {
  background: var(--fs-surface);
  border: 1px solid var(--fs-border);
  border-radius: 8px;
  overflow: hidden;
}

.file-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  cursor: pointer;
  border-bottom: 1px solid var(--fs-border);
  transition: background 0.15s;
}

.file-row:last-child {
  border-bottom: none;
}

.file-row:hover {
  background: var(--fs-hover);
}

.file-row--parent .file-row__name {
  font-weight: 600;
}

.file-row__checkbox {
  display: flex;
  align-items: center;
  width: 18px;
  flex-shrink: 0;
}

.file-row__check {
  width: 16px;
  height: 16px;
  cursor: pointer;
  accent-color: var(--fs-primary);
}

.file-row__icon {
  flex-shrink: 0;
  font-size: 16px;
  line-height: 1;
}

.file-row__icon--parent {
  opacity: 0.9;
}

.file-row__name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-row__meta {
  flex-shrink: 0;
  color: var(--fs-text-secondary);
  font-size: 12px;
  min-width: 72px;
  text-align: right;
}

.file-row__meta--time {
  min-width: 130px;
}

.file-list__empty {
  padding: 48px 0;
  text-align: center;
  color: var(--fs-text-secondary);
}

.browser__footer {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 24px;
  padding-left: max(24px, env(safe-area-inset-left));
  padding-right: max(24px, env(safe-area-inset-right));
  padding-bottom: calc(10px + env(safe-area-inset-bottom));
  background: var(--fs-surface);
  border-top: 1px solid var(--fs-border);
  box-shadow: 0 -2px 8px var(--fs-shadow);
  z-index: 10;
}

.browser__selected {
  color: var(--fs-text-secondary);
  font-size: 13px;
}

.browser__actions {
  display: flex;
  gap: 12px;
}

@media (max-width: 640px) {
  .browser__header {
    padding: 16px 4px 12px;
    padding-top: max(16px, env(safe-area-inset-top));
    gap: 10px;
    flex-wrap: wrap;
  }

  .browser__title {
    font-size: 20px;
  }

  .browser__path {
    flex: 0 0 100%;
    font-size: 12px;
  }

  .file-row {
    padding: 12px 12px;
    gap: 10px;
  }

  .file-row__meta--time {
    display: none;
  }

  .file-row__meta {
    min-width: 56px;
    font-size: 11px;
  }

  .browser__footer {
    padding-top: 8px;
    padding-bottom: calc(8px + env(safe-area-inset-bottom));
  }

  .browser__selected {
    font-size: 12px;
  }
}
</style>
