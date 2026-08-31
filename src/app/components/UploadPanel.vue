<script setup lang="ts">
/**
 * 上传面板组件(右侧抽屉)。
 * - 基于 tus 分片协议并发上传多个文件;
 * - 支持暂停 / 恢复 / 取消 / 重试 / 清除已完成任务;
 * - 关闭面板或批量操作前,存在进行中任务时弹出确认对话框。
 */
import { ref, computed } from 'vue';
import * as tus from 'tus-js-client';
import { showConfirmDialog } from 'vant';
import { formatSize } from '../utils/format';
import { t } from '../i18n';
import type { UploadTask } from './UploadPanel';

/** 面板显隐状态:由父组件 modelValue 双向绑定 */
const props = defineProps<{ modelValue: boolean }>();
const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void;
  (e: 'uploaded'): void;
}>();

// 上传状态:文件选择框、并发数、任务列表
const fileInput = ref<HTMLInputElement | null>(null);
const concurrency = ref(5);
const tasks = ref<UploadTask[]>([]);

// 任务自增 id;当前进行中的任务数(受并发数约束)
let idSeq = 0;
let activeCount = 0;

// 面板显隐:同步父组件的 modelValue
const visible = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v),
});

// 各状态任务计数与批量操作可用性
const uploadingCount = computed(() => tasks.value.filter((t) => t.status === 'uploading').length);
const waitingCount = computed(() => tasks.value.filter((t) => t.status === 'waiting').length);
const pausedCount = computed(() => tasks.value.filter((t) => t.status === 'paused').length);
const completedCount = computed(() => tasks.value.filter((t) => t.status === 'completed').length);
const hasActive = computed(
  () => uploadingCount.value > 0 || waitingCount.value > 0 || pausedCount.value > 0,
);
const canStart = computed(() => waitingCount.value > 0 || pausedCount.value > 0);
const canPause = computed(() => uploadingCount.value > 0);
const canClear = computed(() => completedCount.value > 0);
const canCancel = computed(() => tasks.value.some((t) => t.status !== 'completed'));

/** 并发调度:有空闲额度时取出一个等待中的任务启动 */
function pump() {
  if (activeCount >= concurrency.value) {
    return;
  }
  const next = tasks.value.find((t) => t.status === 'waiting');
  if (!next) {
    return;
  }
  startTask(next);
}

/**
 * 启动单个上传任务(新建 tus 上传并开始)。
 * @param task 目标任务,仅 waiting / error 状态可启动
 */
function startTask(task: UploadTask) {
  if (task.status !== 'waiting' && task.status !== 'error') {
    return;
  }
  if (activeCount >= concurrency.value) {
    return;
  }
  activeCount += 1;
  task.status = 'uploading';
  task.error = '';
  const upload = new tus.Upload(task.file, {
    endpoint: '/api/upload',
    chunkSize: 5 * 1024 * 1024,
    retryDelays: [0, 1000, 3000, 5000],
    removeFingerprintOnSuccess: true,
    metadata: {
      filename: task.file.name,
      filetype: task.file.type || 'application/octet-stream',
    },
    onProgress: (bytesSent: number, bytesTotal: number) => {
      // 实时更新任务进度百分比
      task.progress = bytesTotal > 0 ? Math.round((bytesSent / bytesTotal) * 100) : 0;
    },
    onSuccess: () => {
      // 成功后释放并发额度,通知父组件刷新文件列表,并继续调度下一个任务
      task.status = 'completed';
      task.progress = 100;
      activeCount -= 1;
      emit('uploaded');
      pump();
    },
    onError: (err) => {
      // 失败后释放并发额度并继续调度,任务状态标记为 error 供用户重试
      task.status = 'error';
      task.error = err.message;
      activeCount -= 1;
      pump();
    },
  });
  task.upload = upload;
  upload.start();
}

/**
 * 文件选择回调:把选中的文件追加为 waiting 任务,并清空输入以便重复选择。
 * @param e change 事件
 */
function onFilesSelected(e: Event) {
  const input = e.target as HTMLInputElement;
  const files = Array.from(input.files || []);
  for (const file of files) {
    tasks.value.push({
      id: ++idSeq,
      file,
      upload: null,
      status: 'waiting',
      progress: 0,
      error: '',
    });
  }
  input.value = '';
}

/** 全部上传:先恢复所有暂停任务,再调度等待中的任务 */
function startAll() {
  for (const task of tasks.value) {
    if (task.status === 'paused') {
      resumeTask(task);
    }
  }
  pump();
}

/**
 * 暂停单个上传任务(中止网络请求,保留已传分片)。
 * @param task 目标任务,仅 uploading 状态可暂停
 */
async function pauseTask(task: UploadTask) {
  if (task.status !== 'uploading') {
    return;
  }
  task.status = 'paused';
  try {
    await task.upload?.abort();
  } catch {
    /* 忽略中止错误 */
  } finally {
    activeCount -= 1;
  }
  pump();
}

/**
 * 恢复暂停的任务(重新发起上传,续传已传分片)。
 * @param task 目标任务,仅 paused 状态可恢复
 */
function resumeTask(task: UploadTask) {
  if (task.status !== 'paused') {
    return;
  }
  if (activeCount >= concurrency.value) {
    return;  // 尊重并发上限,超限保持 paused
  }

  activeCount += 1;
  task.status = 'uploading';
  task.upload?.start();
}

/**
 * 取消任务:已创建上传时删除服务端分片,然后从列表移除。
 * @param task 目标任务
 */
async function cancelTask(task: UploadTask) {
  const idx = tasks.value.indexOf(task);
  if (idx < 0) {
    return;
  }
  const wasUploading = task.status === 'uploading';
  if (task.upload?.url) {
    // 已创建上传:中止并删除服务端已上传分片
    try {
      await task.upload.abort(true);
    } catch {
      /* 忽略 */
    }
  } else if (wasUploading) {
    try {
      await task.upload?.abort();
    } catch {
      /* 忽略 */
    }
  }
  if (wasUploading) {
    activeCount -= 1;
  }
  tasks.value.splice(idx, 1);
  pump();
}

/** 批量暂停:先弹确认框,确认后暂停所有上传中的任务 */
function confirmPauseAll() {
  showConfirmDialog({
    title: t('dialog.title'),
    message: t('dialog.pauseAll'),
    confirmButtonText: t('dialog.confirm'),
    cancelButtonText: t('dialog.cancel'),
  })
    .then(() => {
      const uploading = tasks.value.filter((t) => t.status === 'uploading');
      for (const task of uploading) {
        void pauseTask(task);
      }
    })
    .catch(() => {
      /* 用户取消 */
    });
}

/** 批量取消:先弹确认框,确认后取消所有未完成任务(含删除服务端分片) */
function confirmCancelAll() {
  showConfirmDialog({
    title: t('dialog.title'),
    message: t('dialog.cancelAll'),
    confirmButtonText: t('dialog.confirm'),
    cancelButtonText: t('dialog.cancel'),
  })
    .then(() => {
      const active = tasks.value.filter((t) => t.status !== 'completed');
      for (const task of active) {
        void cancelTask(task);
      }
    })
    .catch(() => {
      /* 用户取消 */
    });
}

/** 清除所有已完成任务,保留进行中 / 等待 / 失败任务 */
function clearList() {
  tasks.value = tasks.value.filter((t) => t.status !== 'completed');
}

/**
 * 从列表移除单个任务(清除已完成项)。
 * @param task 目标任务
 */
function clearTask(task: UploadTask) {
  const idx = tasks.value.indexOf(task);
  if (idx >= 0) { tasks.value.splice(idx, 1); }
}

/** 关闭按钮回调:存在进行中任务时先弹确认框,避免误关导致上传中断 */
function onCloseClick() {
  if (hasActive.value) {
    showConfirmDialog({
      title: t('dialog.title'),
      message: t('dialog.closePanel'),
      confirmButtonText: t('dialog.confirm'),
      cancelButtonText: t('dialog.cancel'),
    })
      .then(() => {
        visible.value = false;
      })
      .catch(() => {
        /* 用户取消 */
      });
  } else {
    visible.value = false;
  }
}

/** 遮罩点击回调:与关闭按钮行为一致 */
function onOverlayClick() {
  onCloseClick();
}

/**
 * 任务状态文案。
 * @param task 目标任务
 * @returns 状态展示文本(上传中显示进度百分比)
 */
function statusText(task: UploadTask) {
  switch (task.status) {
    case 'waiting':
      return t('status.waiting');
    case 'uploading':
      return `${task.progress}%`;
    case 'paused':
      return t('status.paused');
    case 'completed':
      return t('status.completed');
    case 'error':
      return t('status.error');
  }
}

function primaryActionText(task: UploadTask) {
  switch (task.status) {
    case 'waiting':
      return t('action.upload');
    case 'uploading':
      return t('action.pause');
    case 'paused':
      return t('action.resume');
    case 'completed':
      return t('status.completed');
    case 'error':
      return t('action.retry');
  }
}

/**
 * 次操作按钮文案:已完成显示「清除」,其余显示「取消」。
 * @param task 目标任务
 * @returns 按钮文案
 */
function secondaryActionText(task: UploadTask) {
  return task.status === 'completed' ? t('action.clear') : t('action.cancel');
}

/**
 * 主操作按钮点击回调:按任务状态分发到启动 / 暂停 / 恢复。
 * @param task 目标任务
 */
function onPrimaryAction(task: UploadTask) {
  switch (task.status) {
    case 'waiting':
    case 'error':
      startTask(task);
      break;
    case 'uploading':
      pauseTask(task);
      break;
    case 'paused':
      resumeTask(task);
      break;
  }
}

/**
 * 次操作按钮点击回调:已完成清除,其余取消。
 * @param task 目标任务
 */
function onSecondaryAction(task: UploadTask) {
  if (task.status === 'completed') {
    clearTask(task);
  } else {
    cancelTask(task);
  }
}
</script>

<template>
  <van-popup v-model:show="visible" position="right" :style="{ width: '100%', height: '100%' }"
    @click-overlay="onOverlayClick">
    <div class="upload-panel">
      <div class="upload-panel__header">
        <span class="upload-panel__title">{{ t('upload.title') }}</span>
        <span class="upload-panel__close" @click="onCloseClick">✕</span>
      </div>

      <input ref="fileInput" type="file" multiple class="upload-panel__file-input" @change="onFilesSelected" />

      <div class="upload-panel__list">
        <div v-if="tasks.length === 0" class="upload-panel__empty">
          {{ t('upload.empty') }}
        </div>
        <div v-for="task in tasks" :key="task.id" class="upload-task">
          <div class="upload-task__info">
            <span class="upload-task__name" :title="task.file.name">{{ task.file.name }}</span>
            <span class="upload-task__size">{{ formatSize(task.file.size) }}</span>
          </div>
          <div class="upload-task__row">
            <span class="upload-task__status" :class="`upload-task__status--${task.status}`">
              {{ statusText(task) }}
            </span>
            <div class="upload-task__progress">
              <van-progress v-if="task.status !== 'error'" :percentage="task.progress"
                :color="task.status === 'completed' ? '#26bf26' : undefined" />
              <span v-else class="upload-task__error" :title="task.error">{{ task.error }}</span>
            </div>
            <div class="upload-task__actions">
              <van-button size="mini" type="primary" :disabled="task.status === 'completed'"
                @click="onPrimaryAction(task)">
                {{ primaryActionText(task) }}
              </van-button>
              <van-button size="mini" plain @click="onSecondaryAction(task)">{{
                secondaryActionText(task)
                }}</van-button>
            </div>
          </div>
        </div>
      </div>

      <div class="upload-panel__toolbar">
        <label class="upload-panel__concurrency">
          <span>{{ t('upload.concurrency') }}</span>
          <input v-model.number="concurrency" type="number" min="1" step="1" class="upload-panel__num" />
        </label>
        <van-button size="small" type="primary" @click="fileInput?.click()">{{
          t('upload.select')
          }}</van-button>
      </div>

      <div class="upload-panel__footer">
        <van-button size="small" :disabled="!canPause" @click="confirmPauseAll">{{
          t('upload.pauseAll')
          }}</van-button>
        <van-button size="small" :disabled="!canCancel" @click="confirmCancelAll">{{
          t('upload.cancelAll')
          }}</van-button>
        <van-button size="small" :disabled="!canClear" @click="clearList">{{
          t('upload.clearList')
          }}</van-button>
        <van-button size="small" type="primary" :disabled="!canStart" @click="startAll">{{
          t('upload.startAll')
          }}</van-button>
      </div>
    </div>
  </van-popup>
</template>

<style scoped>
.upload-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--fs-surface);
  color: var(--fs-text);
}

.upload-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  padding-top: max(14px, env(safe-area-inset-top));
  border-bottom: 1px solid var(--fs-border);
  font-size: 16px;
  font-weight: 600;
}

.upload-panel__close {
  cursor: pointer;
  font-size: 16px;
  color: var(--fs-text-secondary);
  padding: 4px;
}

.upload-panel__close:hover {
  color: var(--fs-text);
}

.upload-panel__toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 16px;
  border-top: 1px solid var(--fs-border);
}

.upload-panel__concurrency {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--fs-text-secondary);
}

.upload-panel__num {
  width: 64px;
  height: 28px;
  padding: 0 8px;
  border: 1px solid var(--fs-border);
  border-radius: 4px;
  background: var(--fs-bg);
  color: var(--fs-text);
  font-size: 13px;
  text-align: center;
  outline: none;
}

.upload-panel__num:focus {
  border-color: var(--fs-primary);
}

.upload-panel__file-input {
  display: none;
}

.upload-panel__list {
  flex: 1;
  overflow-y: auto;
  padding: 8px 16px;
}

.upload-panel__empty {
  padding: 48px 0;
  text-align: center;
  color: var(--fs-text-secondary);
  font-size: 13px;
}

.upload-task {
  padding: 10px 0;
  border-bottom: 1px solid var(--fs-border);
}

.upload-task__info {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.upload-task__name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
}

.upload-task__size {
  flex-shrink: 0;
  color: var(--fs-text-secondary);
  font-size: 12px;
}

.upload-task__row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 6px;
}

.upload-task__progress {
  flex: 1;
  min-width: 0;
}

.upload-task__status {
  font-size: 12px;
  color: var(--fs-text-secondary);
  min-width: 44px;
}

.upload-task__status--uploading {
  color: var(--fs-primary);
}

.upload-task__status--paused {
  color: #f5a623;
}

.upload-task__status--completed {
  color: #26bf26;
}

.upload-task__status--error {
  color: var(--fs-primary);
}

.upload-task__error {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  color: var(--fs-primary);
}

.upload-task__actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.upload-panel__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
  padding: 12px 16px;
  padding-bottom: calc(12px + env(safe-area-inset-bottom));
  border-top: 1px solid var(--fs-border);
}

@media (max-width: 640px) {
  .upload-panel__list {
    padding: 8px 12px;
  }

  .upload-panel__header {
    padding: 12px 12px;
    padding-top: max(12px, env(safe-area-inset-top));
    font-size: 15px;
  }
}
</style>
