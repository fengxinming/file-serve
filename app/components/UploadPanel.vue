<script setup lang="ts">
import { ref, computed } from 'vue'
import * as tus from 'tus-js-client'
import { formatSize } from '../utils/format'
import type { UploadTask } from './UploadPanel.types'

const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'uploaded'): void
}>()

const fileInput = ref<HTMLInputElement | null>(null)
const concurrency = ref(5)
const tasks = ref<UploadTask[]>([])

let idSeq = 0
let activeCount = 0

const visible = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v)
})

const uploadingCount = computed(() => tasks.value.filter((t) => t.status === 'uploading').length)
const waitingCount = computed(() => tasks.value.filter((t) => t.status === 'waiting').length)
const pausedCount = computed(() => tasks.value.filter((t) => t.status === 'paused').length)
const completedCount = computed(() => tasks.value.filter((t) => t.status === 'completed').length)
const hasActive = computed(() => uploadingCount.value > 0 || waitingCount.value > 0 || pausedCount.value > 0)
const canStart = computed(() => waitingCount.value > 0 || pausedCount.value > 0)
const canPause = computed(() => uploadingCount.value > 0)
const canClear = computed(() => completedCount.value > 0)
const canCancel = computed(() => tasks.value.some((t) => t.status !== 'completed'))

function pump() {
  if (activeCount >= concurrency.value) return
  const next = tasks.value.find((t) => t.status === 'waiting')
  if (!next) return
  activeCount += 1
  startTask(next)
}

function startTask(task: UploadTask) {
  if (task.status !== 'waiting' && task.status !== 'error') return
  if (activeCount >= concurrency.value) return
  activeCount += 1
  task.status = 'uploading'
  task.error = ''
  const upload = new tus.Upload(task.file, {
    endpoint: '/api/upload',
    chunkSize: 5 * 1024 * 1024,
    retryDelays: [0, 1000, 3000, 5000],
    removeFingerprintOnSuccess: true,
    metadata: {
      filename: task.file.name,
      filetype: task.file.type || 'application/octet-stream'
    },
    onProgress: (bytesSent: number, bytesTotal: number) => {
      task.progress = bytesTotal > 0 ? Math.round((bytesSent / bytesTotal) * 100) : 0
    },
    onSuccess: () => {
      task.status = 'completed'
      task.progress = 100
      activeCount -= 1
      emit('uploaded')
      pump()
    },
    onError: (err) => {
      task.status = 'error'
      task.error = err.message
      activeCount -= 1
      pump()
    }
  })
  task.upload = upload
  upload.start()
}

function onFilesSelected(e: Event) {
  const input = e.target as HTMLInputElement
  const files = Array.from(input.files || [])
  for (const file of files) {
    tasks.value.push({
      id: ++idSeq,
      file,
      upload: null,
      status: 'waiting',
      progress: 0,
      error: ''
    })
  }
  input.value = ''
}

function startAll() {
  for (const task of tasks.value) {
    if (task.status === 'paused') resumeTask(task)
  }
  pump()
}

async function pauseTask(task: UploadTask) {
  if (task.status !== 'uploading') return
  task.status = 'paused'
  activeCount -= 1
  try {
    await task.upload?.abort()
  } catch {
    /* 忽略中止错误 */
  }
  pump()
}

function resumeTask(task: UploadTask) {
  if (task.status !== 'paused') return
  activeCount += 1
  task.status = 'uploading'
  task.upload?.start()
}

async function cancelTask(task: UploadTask) {
  const idx = tasks.value.indexOf(task)
  if (idx < 0) return
  const wasUploading = task.status === 'uploading'
  if (task.upload?.url) {
    // 已创建上传：中止并删除服务端已上传分片
    try {
      await task.upload.abort(true)
    } catch {
      /* 忽略 */
    }
  } else if (wasUploading) {
    try {
      await task.upload?.abort()
    } catch {
      /* 忽略 */
    }
  }
  if (wasUploading) activeCount -= 1
  tasks.value.splice(idx, 1)
  pump()
}

function confirmPauseAll() {
  showConfirmDialog({
    title: '提示',
    message: '确定暂停所有上传中的任务吗？',
    confirmButtonText: '确定',
    cancelButtonText: '取消'
  })
    .then(() => {
      const uploading = tasks.value.filter((t) => t.status === 'uploading')
      for (const task of uploading) {
        void pauseTask(task)
      }
    })
    .catch(() => {
      /* 用户取消 */
    })
}

function confirmCancelAll() {
  showConfirmDialog({
    title: '提示',
    message: '取消任务将删除服务端已上传的分片，确定全部取消吗？',
    confirmButtonText: '确定',
    cancelButtonText: '取消'
  })
    .then(() => {
      const active = tasks.value.filter((t) => t.status !== 'completed')
      for (const task of [...active]) {
        void cancelTask(task)
      }
    })
    .catch(() => {
      /* 用户取消 */
    })
}

function clearList() {
  tasks.value = tasks.value.filter((t) => t.status !== 'completed')
}

function clearTask(task: UploadTask) {
  const idx = tasks.value.indexOf(task)
  if (idx >= 0) tasks.value.splice(idx, 1)
}

function onCloseClick() {
  if (hasActive.value) {
    showConfirmDialog({
      title: '提示',
      message: '有任务正在上传，确定关闭面板吗？',
      confirmButtonText: '确定',
      cancelButtonText: '取消'
    })
      .then(() => {
        visible.value = false
      })
      .catch(() => {
        /* 用户取消 */
      })
  } else {
    visible.value = false
  }
}

function onOverlayClick() {
  onCloseClick()
}

function statusText(task: UploadTask) {
  switch (task.status) {
    case 'waiting':
      return '等待中'
    case 'uploading':
      return `${task.progress}%`
    case 'paused':
      return '已暂停'
    case 'completed':
      return '已完成'
    case 'error':
      return '失败'
  }
}

function primaryActionText(task: UploadTask) {
  switch (task.status) {
    case 'waiting':
      return '上传'
    case 'uploading':
      return '暂停'
    case 'paused':
      return '继续'
    case 'completed':
      return '已完成'
    case 'error':
      return '重试'
  }
}

function secondaryActionText(task: UploadTask) {
  return task.status === 'completed' ? '清除' : '取消'
}

function onPrimaryAction(task: UploadTask) {
  switch (task.status) {
    case 'waiting':
    case 'error':
      startTask(task)
      break
    case 'uploading':
      pauseTask(task)
      break
    case 'paused':
      resumeTask(task)
      break
  }
}

function onSecondaryAction(task: UploadTask) {
  if (task.status === 'completed') {
    clearTask(task)
  } else {
    cancelTask(task)
  }
}
</script>

<template>
  <van-popup
    v-model:show="visible"
    position="right"
    :style="{ width: '100%', height: '100%' }"
    @click-overlay="onOverlayClick"
  >
    <div class="upload-panel">
      <div class="upload-panel__header">
        <span class="upload-panel__title">上传文件</span>
        <span class="upload-panel__close" @click="onCloseClick">✕</span>
      </div>

      <input ref="fileInput" type="file" multiple class="upload-panel__file-input" @change="onFilesSelected" />

      <div class="upload-panel__list">
        <div v-if="tasks.length === 0" class="upload-panel__empty">尚未选择文件</div>
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
              <van-progress
                v-if="task.status !== 'error'"
                :percentage="task.progress"
                :show-text="false"
                :color="task.status === 'completed' ? '#26bf26' : undefined"
              />
              <span v-else class="upload-task__error" :title="task.error">{{ task.error }}</span>
            </div>
            <div class="upload-task__actions">
              <van-button
                size="mini"
                type="primary"
                :disabled="task.status === 'completed'"
                @click="onPrimaryAction(task)"
              >
                {{ primaryActionText(task) }}
              </van-button>
              <van-button size="mini" plain @click="onSecondaryAction(task)">{{ secondaryActionText(task) }}</van-button>
            </div>
          </div>
        </div>
      </div>

      <div class="upload-panel__toolbar">
        <label class="upload-panel__concurrency">
          <span>并发数</span>
          <input v-model.number="concurrency" type="number" min="1" step="1" class="upload-panel__num" />
        </label>
        <van-button size="small" type="primary" @click="fileInput?.click()">选择文件</van-button>
      </div>

      <div class="upload-panel__footer">
        <van-button size="small" :disabled="!canPause" @click="confirmPauseAll">全部暂停</van-button>
        <van-button size="small" :disabled="!canCancel" @click="confirmCancelAll">全部取消</van-button>
        <van-button size="small" :disabled="!canClear" @click="clearList">清除列表</van-button>
        <van-button size="small" type="primary" :disabled="!canStart" @click="startAll">全部上传</van-button>
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
