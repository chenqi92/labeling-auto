import { useEffect, useMemo, useState } from 'react'
import { Download, X, Loader2 } from 'lucide-react'
import { useStore, selectImages, selectClasses, selectActiveProject } from '../store'
import { exportYolo } from '../api'

const EMPTY_ANN_MAP: Record<string, { x1: number; y1: number; x2: number; y2: number; classId: number }[]> = {}

export default function ExportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const images = useStore(selectImages)
  const annotations = useStore((s) => selectActiveProject(s)?.annotations ?? EMPTY_ANN_MAP)
  const classes = useStore(selectClasses)
  const projectName = useStore((s) => selectActiveProject(s)?.name ?? 'dataset')

  const [name, setName] = useState('dataset')
  const [splitMode, setSplitMode] = useState<'all' | '0.8' | '0.9'>('all')
  const [includeBg, setIncludeBg] = useState(false)
  const [busy, setBusy] = useState(false)

  // 打开导出框时，数据集名默认取当前项目名
  useEffect(() => {
    if (open) setName(projectName)
  }, [open, projectName])

  const stats = useMemo(() => {
    const totalBoxes = Object.values(annotations).reduce((s, l) => s + l.length, 0)
    const annotatedImages = images.filter((i) => (annotations[i.id]?.length ?? 0) > 0).length
    return { totalBoxes, annotatedImages }
  }, [images, annotations])

  const exportImages = includeBg
    ? images
    : images.filter((i) => (annotations[i.id]?.length ?? 0) > 0)

  if (!open) return null

  const onExport = async () => {
    if (classes.length === 0) {
      alert('还没有任何类别')
      return
    }
    // 把可能有空洞的 classId 重映射为连续的 0..n-1
    const ordered = [...classes].sort((a, b) => a.id - b.id)
    const idToIndex = new Map(ordered.map((c, i) => [c.id, i]))
    const names = ordered.map((c) => c.name)

    const items = exportImages.map((img) => ({
      image_id: img.id,
      annotations: (annotations[img.id] ?? []).map((a) => ({
        class_id: idToIndex.get(a.classId) ?? 0,
        x1: a.x1,
        y1: a.y1,
        x2: a.x2,
        y2: a.y2,
      })),
    }))

    setBusy(true)
    try {
      const blob = await exportYolo({
        dataset_name: name.trim() || 'dataset',
        classes: names,
        items,
        train_ratio: splitMode === 'all' ? null : Number(splitMode),
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${name.trim() || 'dataset'}.zip`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      onClose()
    } catch (e) {
      alert(`导出失败：${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-800">导出 YOLO 数据集</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 text-sm">
          <div className="grid grid-cols-3 gap-2 text-center">
            <Stat label="图片" value={images.length} />
            <Stat label="已标注" value={stats.annotatedImages} />
            <Stat label="标注框" value={stats.totalBoxes} />
          </div>

          <label className="block">
            <span className="mb-1 block text-slate-600">数据集名称</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-1.5 focus:border-indigo-400 focus:outline-none"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-slate-600">训练 / 验证集划分</span>
            <select
              value={splitMode}
              onChange={(e) => setSplitMode(e.target.value as 'all' | '0.8' | '0.9')}
              className="w-full rounded-md border border-slate-300 px-3 py-1.5 focus:border-indigo-400 focus:outline-none"
            >
              <option value="all">全部作为训练集</option>
              <option value="0.8">train 80% / val 20%</option>
              <option value="0.9">train 90% / val 10%</option>
            </select>
          </label>

          <label className="flex cursor-pointer items-center gap-2 text-slate-600">
            <input
              type="checkbox"
              checked={includeBg}
              onChange={(e) => setIncludeBg(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300"
            />
            包含未标注图片作为背景图（生成空 label）
          </label>

          <div className="rounded-md bg-slate-50 p-3 text-xs text-slate-500">
            将导出 <b>{exportImages.length}</b> 张图片、{classes.length} 个类别。
            内容：<code>data.yaml</code>、<code>classes.txt</code>、
            <code>images/</code>、<code>labels/</code>（归一化 <code>class xc yc w h</code>）。
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-md px-4 py-2 text-sm text-slate-600 hover:bg-slate-100">
            取消
          </button>
          <button
            onClick={onExport}
            disabled={busy || exportImages.length === 0}
            className="flex items-center gap-1.5 rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            下载 zip
          </button>
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md bg-slate-50 py-2">
      <div className="text-lg font-semibold text-slate-800">{value}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  )
}
