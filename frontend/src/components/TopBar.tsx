import { Download, Cpu, Loader2 } from 'lucide-react'
import { useStore, selectImages } from '../store'
import { loadModel } from '../api'
import type { ModelState } from '../types'

const STATE_STYLE: Record<ModelState, { dot: string; text: string; label: string }> = {
  unloaded: { dot: 'bg-slate-400', text: 'text-slate-600', label: '未加载' },
  loading: { dot: 'bg-amber-400 animate-pulse', text: 'text-amber-600', label: '加载中' },
  ready: { dot: 'bg-emerald-500', text: 'text-emerald-600', label: '就绪' },
  error: { dot: 'bg-rose-500', text: 'text-rose-600', label: '错误' },
}

export default function TopBar({ onExport }: { onExport: () => void }) {
  const model = useStore((s) => s.model)
  const setModel = useStore((s) => s.setModel)
  const images = useStore(selectImages)
  const st = STATE_STYLE[model.state]

  const onLoad = async () => {
    try {
      setModel(await loadModel())
    } catch (e) {
      alert(`加载失败：${(e as Error).message}`)
    }
  }

  return (
    <header className="flex items-center gap-4 border-b border-slate-200 bg-white px-5 py-3">
      <div className="flex items-center gap-2">
        <Cpu className="h-5 w-5 text-indigo-600" />
        <h1 className="text-base font-semibold">LocateAnything 自动标注</h1>
      </div>

      <div
        className="flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1 text-xs"
        title={model.message || ''}
      >
        <span className={`h-2 w-2 rounded-full ${st.dot}`} />
        <span className={st.text}>模型 {st.label}</span>
        {model.quantization && model.quantization !== '-' && (
          <span className="text-slate-400">· {model.quantization}</span>
        )}
        {model.device && <span className="text-slate-400">· {model.device}</span>}
      </div>

      {model.state !== 'ready' && (
        <button
          onClick={onLoad}
          disabled={model.state === 'loading'}
          className="flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {model.state === 'loading' ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Cpu className="h-3.5 w-3.5" />
          )}
          加载模型
        </button>
      )}

      <div className="ml-auto">
        <button
          onClick={onExport}
          disabled={images.length === 0}
          className="flex items-center gap-1.5 rounded-md bg-emerald-600 px-3.5 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          <Download className="h-4 w-4" />
          导出 YOLO
        </button>
      </div>
    </header>
  )
}
