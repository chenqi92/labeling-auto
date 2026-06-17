import { useEffect, useRef, useState } from 'react'
import { FolderOpen, Plus, Check, Pencil, Trash2, ChevronDown, X } from 'lucide-react'
import { useStore } from '../store'

export default function ProjectSwitcher() {
  const projects = useStore((s) => s.projects)
  const activeProjectId = useStore((s) => s.activeProjectId)
  const setActiveProject = useStore((s) => s.setActiveProject)
  const addProject = useStore((s) => s.addProject)
  const renameProject = useStore((s) => s.renameProject)
  const removeProject = useStore((s) => s.removeProject)

  const [open, setOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)

  const active = projects.find((p) => p.id === activeProjectId)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const startEdit = (id: string, name: string) => {
    setEditId(id)
    setEditName(name)
  }
  const commitEdit = () => {
    if (editId) renameProject(editId, editName)
    setEditId(null)
  }

  const countLabel = (p: (typeof projects)[number]) => {
    const boxes = Object.values(p.annotations).reduce((s, l) => s + l.length, 0)
    return `${p.images.length} 图 · ${p.classes.length} 类 · ${boxes} 框`
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-left text-sm hover:border-indigo-300"
      >
        <FolderOpen className="h-4 w-4 shrink-0 text-indigo-600" />
        <span className="min-w-0 flex-1 truncate font-medium text-slate-700" title={active?.name}>
          {active?.name ?? '未命名项目'}
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full z-20 mt-1 rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
          <ul className="max-h-72 overflow-y-auto">
            {projects.map((p) => {
              const isActive = p.id === activeProjectId
              return (
                <li
                  key={p.id}
                  className={`group flex items-center gap-1.5 rounded-md px-2 py-1.5 ${
                    isActive ? 'bg-indigo-50' : 'hover:bg-slate-50'
                  }`}
                >
                  {editId === p.id ? (
                    <>
                      <input
                        autoFocus
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') commitEdit()
                          if (e.key === 'Escape') setEditId(null)
                        }}
                        className="min-w-0 flex-1 rounded border border-indigo-300 px-1 py-0.5 text-sm focus:outline-none"
                      />
                      <button onClick={commitEdit} className="text-emerald-600" title="确定">
                        <Check className="h-4 w-4" />
                      </button>
                      <button onClick={() => setEditId(null)} className="text-slate-400" title="取消">
                        <X className="h-4 w-4" />
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => {
                          setActiveProject(p.id)
                          setOpen(false)
                        }}
                        className="flex min-w-0 flex-1 flex-col items-start text-left"
                      >
                        <span className="flex w-full items-center gap-1.5">
                          {isActive && <Check className="h-3.5 w-3.5 shrink-0 text-indigo-600" />}
                          <span className="min-w-0 truncate text-sm text-slate-700">{p.name}</span>
                        </span>
                        <span className="truncate text-[10px] text-slate-400">{countLabel(p)}</span>
                      </button>
                      <button
                        onClick={() => startEdit(p.id, p.name)}
                        className="hidden shrink-0 text-slate-400 hover:text-slate-700 group-hover:block"
                        title="重命名"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => {
                          if (
                            confirm(
                              `删除项目「${p.name}」？该项目的素材登记、类别与标注都会从界面移除${
                                projects.length === 1 ? '（将自动新建一个空项目）' : ''
                              }。`,
                            )
                          )
                            removeProject(p.id)
                        }}
                        className="hidden shrink-0 text-slate-400 hover:text-rose-600 group-hover:block"
                        title="删除项目"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </>
                  )}
                </li>
              )
            })}
          </ul>
          <button
            onClick={() => {
              addProject()
              setOpen(false)
            }}
            className="mt-1 flex w-full items-center gap-1.5 rounded-md border-t border-slate-100 px-2 py-1.5 text-sm text-indigo-600 hover:bg-indigo-50"
          >
            <Plus className="h-4 w-4" />
            新建项目
          </button>
        </div>
      )}
    </div>
  )
}
