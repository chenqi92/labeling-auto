import { useState } from 'react'
import { FileText, Copy, Check } from 'lucide-react'
import { useStore } from '../store'

export default function RecognizePanel() {
  const activeImageId = useStore((s) => s.activeImageId)
  const recognitions = useStore((s) => s.recognitions)
  const busy = useStore((s) => s.busy)
  const task = useStore((s) => s.projects.find((p) => p.id === s.activeProjectId)?.detect.task)
  const [copied, setCopied] = useState(false)

  const res = activeImageId ? recognitions[activeImageId] : undefined
  // 仅在「文字识别」任务下，或当前图已有识别结果时显示
  if (task !== 'recognize' && !res) return null

  const running = activeImageId ? busy[activeImageId] : false

  const copy = async () => {
    if (!res?.text) return
    try {
      await navigator.clipboard.writeText(res.text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* 剪贴板不可用时忽略 */
    }
  }

  return (
    <div className="border-b border-slate-200">
      <div className="flex items-center gap-2 px-4 pb-2 pt-3">
        <FileText className="h-4 w-4 text-slate-500" />
        <h2 className="text-sm font-semibold text-slate-700">文字识别</h2>
        {res && (
          <>
            <span className="ml-auto text-xs text-slate-400">{res.elapsed_ms}ms</span>
            {res.text && (
              <button
                onClick={copy}
                className="flex items-center gap-1 text-xs text-slate-400 hover:text-indigo-600"
                title="复制全部文字"
              >
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? '已复制' : '复制'}
              </button>
            )}
          </>
        )}
      </div>

      <div className="px-3 pb-3">
        {running && !res && (
          <p className="px-2 py-4 text-center text-xs text-slate-400">识别中…（首次需加载模型，约十几秒）</p>
        )}
        {!running && !res && (
          <p className="px-2 py-4 text-center text-xs text-slate-400">点「识别当前」提取图中文字</p>
        )}
        {res &&
          (res.text ? (
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-md bg-slate-50 px-2.5 py-2 text-xs leading-relaxed text-slate-700">
              {res.text}
            </pre>
          ) : (
            <p className="px-2 py-3 text-center text-xs text-slate-400">未识别到文字</p>
          ))}
      </div>
    </div>
  )
}
