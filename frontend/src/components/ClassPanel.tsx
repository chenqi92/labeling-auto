import { useState } from 'react'
import { Plus, Pencil, Trash2, Check, X, Tag } from 'lucide-react'
import { useStore, selectClasses, selectActiveProject } from '../store'

const EMPTY_ANN_MAP: Record<string, { classId: number }[]> = {}

export default function ClassPanel() {
  const classes = useStore(selectClasses)
  const activeClassId = useStore((s) => s.activeClassId)
  const annotations = useStore((s) => selectActiveProject(s)?.annotations ?? EMPTY_ANN_MAP)
  const setActiveClass = useStore((s) => s.setActiveClass)
  const addClass = useStore((s) => s.addClass)
  const renameClass = useStore((s) => s.renameClass)
  const removeClass = useStore((s) => s.removeClass)

  const [newName, setNewName] = useState('')
  const [editId, setEditId] = useState<number | null>(null)
  const [editName, setEditName] = useState('')

  const totalByClass = (classId: number) =>
    Object.values(annotations).reduce(
      (sum, list) => sum + list.filter((a) => a.classId === classId).length,
      0,
    )

  const onAdd = () => {
    const n = newName.trim()
    if (!n) return
    const id = addClass(n)
    setActiveClass(id)
    setNewName('')
  }

  const startEdit = (id: number, name: string) => {
    setEditId(id)
    setEditName(name)
  }
  const commitEdit = () => {
    if (editId != null) renameClass(editId, editName)
    setEditId(null)
  }

  return (
    <div className="flex max-h-[55%] flex-col border-b border-slate-200">
      <div className="flex items-center gap-2 px-4 pb-2 pt-3">
        <Tag className="h-4 w-4 text-slate-500" />
        <h2 className="text-sm font-semibold text-slate-700">类别</h2>
        <span className="text-xs text-slate-400">{classes.length}</span>
      </div>

      <div className="flex gap-1.5 px-4 pb-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onAdd()}
          placeholder="新增类别…"
          className="min-w-0 flex-1 rounded-md border border-slate-300 px-2 py-1 text-sm focus:border-indigo-400 focus:outline-none"
        />
        <button
          onClick={onAdd}
          className="flex items-center rounded-md bg-slate-700 px-2 text-white hover:bg-slate-800"
          title="添加"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      <ul className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {classes.length === 0 && (
          <li className="px-2 py-3 text-center text-xs text-slate-400">
            检测后自动生成，或手动添加
          </li>
        )}
        {classes.map((c) => {
          const active = c.id === activeClassId
          return (
            <li
              key={c.id}
              onClick={() => setActiveClass(c.id)}
              className={`group flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm ${
                active ? 'bg-indigo-50 ring-1 ring-indigo-200' : 'hover:bg-slate-50'
              }`}
            >
              <span className="h-3.5 w-3.5 shrink-0 rounded" style={{ backgroundColor: c.color }} />
              {editId === c.id ? (
                <>
                  <input
                    autoFocus
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitEdit()
                      if (e.key === 'Escape') setEditId(null)
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="min-w-0 flex-1 rounded border border-indigo-300 px-1 py-0.5 text-sm focus:outline-none"
                  />
                  <button onClick={(e) => { e.stopPropagation(); commitEdit() }} className="text-emerald-600">
                    <Check className="h-4 w-4" />
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); setEditId(null) }} className="text-slate-400">
                    <X className="h-4 w-4" />
                  </button>
                </>
              ) : (
                <>
                  <span className="min-w-0 flex-1 truncate text-slate-700" title={c.name}>
                    {c.name}
                  </span>
                  <span className="shrink-0 rounded bg-slate-100 px-1.5 text-[10px] text-slate-500">
                    {totalByClass(c.id)}
                  </span>
                  <button
                    onClick={(e) => { e.stopPropagation(); startEdit(c.id, c.name) }}
                    className="hidden text-slate-400 hover:text-slate-700 group-hover:block"
                    title="重命名"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      if (confirm(`删除类别「${c.name}」及其所有标注？`)) removeClass(c.id)
                    }}
                    className="hidden text-slate-400 hover:text-rose-600 group-hover:block"
                    title="删除"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </>
              )}
            </li>
          )
        })}
      </ul>
      {activeClassId != null && (
        <p className="px-4 pb-2 text-[11px] text-slate-400">
          新画的框将归入高亮类别
        </p>
      )}
    </div>
  )
}
