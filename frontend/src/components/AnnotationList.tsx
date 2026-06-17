import { Trash2, Sparkles, Hand, Eraser } from 'lucide-react'
import { useStore, selectClasses, selectActiveAnnotations } from '../store'

export default function AnnotationList() {
  const activeImageId = useStore((s) => s.activeImageId)
  const annotations = useStore(selectActiveAnnotations)
  const classes = useStore(selectClasses)
  const selectedAnnId = useStore((s) => s.selectedAnnId)
  const setSelected = useStore((s) => s.setSelected)
  const removeAnnotation = useStore((s) => s.removeAnnotation)
  const updateAnnotation = useStore((s) => s.updateAnnotation)
  const clearAnnotations = useStore((s) => s.clearAnnotations)

  const classOf = (id: number) => classes.find((c) => c.id === id)

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 px-4 pb-2 pt-3">
        <h2 className="text-sm font-semibold text-slate-700">标注</h2>
        <span className="text-xs text-slate-400">{annotations.length}</span>
        {annotations.length > 0 && activeImageId && (
          <button
            onClick={() => {
              if (confirm('清空当前图片的所有标注？')) clearAnnotations(activeImageId)
            }}
            className="ml-auto flex items-center gap-1 text-xs text-slate-400 hover:text-rose-600"
          >
            <Eraser className="h-3.5 w-3.5" />
            清空
          </button>
        )}
      </div>

      <ul className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {annotations.length === 0 && (
          <li className="px-2 py-6 text-center text-xs text-slate-400">
            运行检测，或在画布空白处拖拽画框
          </li>
        )}
        {annotations.map((a, idx) => {
          const cls = classOf(a.classId)
          const selected = a.id === selectedAnnId
          return (
            <li
              key={a.id}
              onClick={() => setSelected(a.id)}
              className={`group flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm ${
                selected ? 'bg-indigo-50 ring-1 ring-indigo-200' : 'hover:bg-slate-50'
              }`}
            >
              <span className="w-5 shrink-0 text-right text-[10px] text-slate-400">{idx + 1}</span>
              <span
                className="h-3 w-3 shrink-0 rounded"
                style={{ backgroundColor: cls?.color ?? '#94a3b8' }}
              />
              <select
                value={a.classId}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => activeImageId && updateAnnotation(activeImageId, a.id, { classId: Number(e.target.value) })}
                className="min-w-0 flex-1 truncate rounded border border-transparent bg-transparent px-0.5 py-0.5 text-sm text-slate-700 hover:border-slate-200 focus:border-indigo-300 focus:outline-none"
              >
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <span
                className="shrink-0 text-slate-300"
                title={a.source === 'auto' ? '模型检测' : '手动添加'}
              >
                {a.source === 'auto' ? (
                  <Sparkles className="h-3.5 w-3.5" />
                ) : (
                  <Hand className="h-3.5 w-3.5" />
                )}
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  if (activeImageId) removeAnnotation(activeImageId, a.id)
                }}
                className="hidden shrink-0 text-slate-400 hover:text-rose-600 group-hover:block"
                title="删除"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
