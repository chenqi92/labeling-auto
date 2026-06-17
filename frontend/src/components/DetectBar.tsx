import { useState } from 'react'
import { Play, Layers, Loader2 } from 'lucide-react'
import { useStore, selectImages, selectDetect } from '../store'
import { detect, getModelStatus, loadModel } from '../api'
import type { ModelStatus, TaskKey } from '../types'
import TagInput from './TagInput'

/** 确保模型就绪：触发加载并轮询直到 ready / error。 */
async function ensureModelReady(setModel: (m: ModelStatus) => void) {
  let status = await getModelStatus()
  setModel(status)
  if (status.state === 'ready') return
  if (status.state !== 'loading') {
    status = await loadModel()
    setModel(status)
  }
  const deadline = Date.now() + 15 * 60 * 1000
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 1500))
    status = await getModelStatus()
    setModel(status)
    if (status.state === 'ready') return
    if (status.state === 'error') throw new Error(status.message || '模型加载失败')
  }
  throw new Error('模型加载超时')
}

export default function DetectBar() {
  const tasks = useStore((s) => s.tasks)
  const cfg = useStore(selectDetect)
  const setDetectConfig = useStore((s) => s.setDetectConfig)
  const images = useStore(selectImages)
  const activeImageId = useStore((s) => s.activeImageId)
  const setModel = useStore((s) => s.setModel)
  const applyDetections = useStore((s) => s.applyDetections)
  const setBusy = useStore((s) => s.setBusy)
  const busy = useStore((s) => s.busy)

  const [running, setRunning] = useState(false)

  const currentTask = tasks.find((t) => t.key === cfg.task)
  const needsQuery = currentTask?.needs_query ?? true
  const hint = currentTask?.hint ?? ''

  const runOne = async (imageId: string, c: typeof cfg) => {
    setBusy(imageId, true)
    try {
      const res = await detect({
        image_id: imageId,
        query: c.query,
        task: c.task,
        mode: c.mode,
        max_new_tokens: c.maxNewTokens,
      })
      applyDetections(imageId, res.boxes, true)
    } finally {
      setBusy(imageId, false)
    }
  }

  const run = async (all: boolean) => {
    // 读取最新配置：标签输入框 onBlur 提交的 chip 会先写入 store，这里取到的就是最终值
    const c = selectDetect(useStore.getState())
    if (needsQuery && !c.query.trim()) {
      alert('请先输入检测目标描述')
      return
    }
    const targets = all ? images.map((i) => i.id) : activeImageId ? [activeImageId] : []
    if (targets.length === 0) {
      alert('请先上传并选择图片')
      return
    }
    setRunning(true)
    try {
      await ensureModelReady(setModel)
      for (const id of targets) {
        await runOne(id, c)
      }
    } catch (e) {
      alert(`检测失败：${(e as Error).message}`)
    } finally {
      setRunning(false)
    }
  }

  const anyBusy = running || Object.values(busy).some(Boolean)

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-4 py-2.5">
      <select
        value={cfg.task}
        onChange={(e) => setDetectConfig({ task: e.target.value as TaskKey })}
        className="rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-indigo-400 focus:outline-none"
      >
        {tasks.map((t) => (
          <option key={t.key} value={t.key}>
            {t.label}
          </option>
        ))}
      </select>

      {cfg.task === 'detection' ? (
        <TagInput
          value={cfg.query}
          onChange={(query) => setDetectConfig({ query })}
          onEnter={() => run(false)}
          placeholder="输入类别后按空格/回车生成标签，如：人 头盔"
          className="min-w-0 flex-1"
        />
      ) : (
        <input
          type="text"
          value={cfg.query}
          disabled={!needsQuery}
          placeholder={needsQuery ? hint : '该任务无需输入'}
          onChange={(e) => setDetectConfig({ query: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === 'Enter') run(false)
          }}
          className="min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-indigo-400 focus:outline-none disabled:bg-slate-100 disabled:text-slate-400"
        />
      )}

      <select
        value={cfg.mode}
        onChange={(e) => setDetectConfig({ mode: e.target.value as 'slow' | 'hybrid' | 'fast' })}
        title="生成模式：slow 最稳，hybrid 平衡，fast 最快"
        className="rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-indigo-400 focus:outline-none"
      >
        <option value="slow">slow（稳）</option>
        <option value="hybrid">hybrid（衡）</option>
        <option value="fast">fast（快）</option>
      </select>

      <button
        onClick={() => run(false)}
        disabled={anyBusy}
        className="flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
      >
        {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
        检测当前
      </button>
      <button
        onClick={() => run(true)}
        disabled={anyBusy || images.length === 0}
        className="flex items-center gap-1.5 rounded-md border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-sm font-medium text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
      >
        <Layers className="h-4 w-4" />
        检测全部
      </button>
    </div>
  )
}
