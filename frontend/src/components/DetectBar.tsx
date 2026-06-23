import { useState } from 'react'
import { Play, Layers, Loader2 } from 'lucide-react'
import { useStore, selectImages, selectDetect } from '../store'
import { detect, getModelStatus, inspect, loadModel, recognizeText } from '../api'
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
  const engines = useStore((s) => s.engines)
  const cfg = useStore(selectDetect)
  const setDetectConfig = useStore((s) => s.setDetectConfig)
  const images = useStore(selectImages)
  const activeImageId = useStore((s) => s.activeImageId)
  const setModel = useStore((s) => s.setModel)
  const applyDetections = useStore((s) => s.applyDetections)
  const setInspection = useStore((s) => s.setInspection)
  const setRecognition = useStore((s) => s.setRecognition)
  const setBusy = useStore((s) => s.setBusy)
  const busy = useStore((s) => s.busy)

  const [running, setRunning] = useState(false)

  const engineKey = cfg.engine || 'la'
  const currentEngine = engines.find((e) => e.key === engineKey)
  // 当前引擎支持的任务（引擎列表未加载时退回全部任务）
  const availableTasks = currentEngine ? tasks.filter((t) => currentEngine.tasks.includes(t.key)) : tasks
  const isYoloe = engineKey.startsWith('yoloe')

  const currentTask = tasks.find((t) => t.key === cfg.task)
  const needsQuery = currentTask?.needs_query ?? true
  const hint = currentTask?.hint ?? ''
  const isInspect = cfg.task === 'inspect'
  // 走 Ollama 的任务：自管加载/卸载，无需 LocateAnything，也没有 slow/fast 模式
  const isVlm = cfg.task === 'inspect' || cfg.task === 'recognize'
  const verb = cfg.task === 'inspect' ? '巡检' : cfg.task === 'recognize' ? '识别' : '检测'

  // 切换引擎：若当前任务不被新引擎支持，自动切到该引擎的首个任务
  const changeEngine = (key: string) => {
    const eng = engines.find((e) => e.key === key)
    if (eng && !eng.tasks.includes(cfg.task)) setDetectConfig({ engine: key, task: eng.tasks[0] })
    else setDetectConfig({ engine: key })
  }

  const runOne = async (imageId: string, c: typeof cfg) => {
    setBusy(imageId, true)
    try {
      if (c.task === 'inspect') {
        const res = await inspect({ image_id: imageId, query: c.query })
        setInspection(imageId, res)
      } else if (c.task === 'recognize') {
        const res = await recognizeText({ image_id: imageId })
        setRecognition(imageId, res)
      } else {
        const res = await detect({
          image_id: imageId,
          query: c.query,
          task: c.task,
          engine: c.engine || 'la',
          mode: c.mode,
          max_new_tokens: c.maxNewTokens,
        })
        applyDetections(imageId, res.boxes, true)
      }
    } finally {
      setBusy(imageId, false)
    }
  }

  const run = async (all: boolean) => {
    // 读取最新配置：标签输入框 onBlur 提交的 chip 会先写入 store，这里取到的就是最终值
    const c = selectDetect(useStore.getState())
    if (needsQuery && !c.query.trim()) {
      alert(isInspect ? '请先输入要判断的问题' : '请先输入检测目标描述')
      return
    }
    const targets = all ? images.map((i) => i.id) : activeImageId ? [activeImageId] : []
    if (targets.length === 0) {
      alert('请先上传并选择图片')
      return
    }
    setRunning(true)
    try {
      // 仅 LocateAnything 引擎的检测/定位类任务需要等 LA 就绪；YOLOE 自带轻量加载，VLM 走 Ollama
      if (!isVlm && !isYoloe) await ensureModelReady(setModel)
      for (const id of targets) {
        await runOne(id, c)
      }
    } catch (e) {
      alert(`${verb}失败：${(e as Error).message}`)
    } finally {
      setRunning(false)
    }
  }

  const anyBusy = running || Object.values(busy).some(Boolean)

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-4 py-2.5">
      {engines.length > 0 && (
        <select
          value={engineKey}
          onChange={(e) => changeEngine(e.target.value)}
          title="检测引擎：LocateAnything 精度高；YOLOE-26 快且轻"
          className="rounded-md border border-slate-300 bg-slate-50 px-2 py-1.5 text-sm focus:border-indigo-400 focus:outline-none"
        >
          {engines.map((en) => (
            <option key={en.key} value={en.key}>
              {en.label}
            </option>
          ))}
        </select>
      )}

      <select
        value={cfg.task}
        onChange={(e) => setDetectConfig({ task: e.target.value as TaskKey })}
        className="rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-indigo-400 focus:outline-none"
      >
        {availableTasks.map((t) => (
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

      {!isVlm && (
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
      )}

      <button
        onClick={() => run(false)}
        disabled={anyBusy}
        className="flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
      >
        {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
        {verb}当前
      </button>
      <button
        onClick={() => run(true)}
        disabled={anyBusy || images.length === 0}
        className="flex items-center gap-1.5 rounded-md border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-sm font-medium text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
      >
        <Layers className="h-4 w-4" />
        {verb}全部
      </button>
    </div>
  )
}
