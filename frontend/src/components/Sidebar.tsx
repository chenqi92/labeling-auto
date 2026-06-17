import { useRef, useState } from 'react'
import { ImagePlus, Loader2, Trash2, CheckCircle2 } from 'lucide-react'
import { useStore, selectImages, selectActiveProject } from '../store'
import { uploadImages } from '../api'
import ProjectSwitcher from './ProjectSwitcher'

const EMPTY_ANN_MAP: Record<string, unknown[]> = {}

export default function Sidebar() {
  const images = useStore(selectImages)
  const activeImageId = useStore((s) => s.activeImageId)
  const annotations = useStore((s) => selectActiveProject(s)?.annotations ?? EMPTY_ANN_MAP)
  const busy = useStore((s) => s.busy)
  const addImages = useStore((s) => s.addImages)
  const setActiveImage = useStore((s) => s.setActiveImage)
  const removeImage = useStore((s) => s.removeImage)

  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)

  const handleFiles = async (files: FileList | File[] | null) => {
    if (!files || (files as FileList).length === 0) return
    setUploading(true)
    try {
      const items = await uploadImages(files)
      addImages(items)
    } catch (e) {
      alert(`上传失败：${(e as Error).message}`)
    } finally {
      setUploading(false)
    }
  }

  return (
    <aside className="flex w-56 flex-col border-r border-slate-200 bg-white">
      <div className="px-3 pt-3">
        <ProjectSwitcher />
      </div>
      <div className="px-3 pb-3 pt-2">
        <button
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragOver(false)
            handleFiles(e.dataTransfer.files)
          }}
          className={`flex w-full flex-col items-center gap-1.5 rounded-lg border-2 border-dashed px-3 py-5 text-xs transition ${
            dragOver ? 'border-indigo-400 bg-indigo-50' : 'border-slate-300 hover:border-indigo-300'
          }`}
        >
          {uploading ? (
            <Loader2 className="h-5 w-5 animate-spin text-indigo-500" />
          ) : (
            <ImagePlus className="h-5 w-5 text-indigo-500" />
          )}
          <span className="font-medium text-slate-600">点击或拖拽上传</span>
          <span className="text-slate-400">支持多张图片</span>
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            handleFiles(e.target.files)
            e.target.value = ''
          }}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {images.length === 0 && (
          <p className="px-2 py-6 text-center text-xs text-slate-400">还没有图片</p>
        )}
        <ul className="space-y-1.5">
          {images.map((img) => {
            const count = annotations[img.id]?.length ?? 0
            const active = img.id === activeImageId
            return (
              <li key={img.id}>
                <div
                  onClick={() => setActiveImage(img.id)}
                  className={`group relative cursor-pointer overflow-hidden rounded-md border ${
                    active ? 'border-indigo-500 ring-1 ring-indigo-500' : 'border-slate-200'
                  }`}
                >
                  <div className="relative aspect-video bg-slate-100">
                    <img
                      src={img.url}
                      alt={img.filename}
                      className="h-full w-full object-contain"
                    />
                    {busy[img.id] && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                        <Loader2 className="h-5 w-5 animate-spin text-white" />
                      </div>
                    )}
                    {img.detected && (
                      <CheckCircle2 className="absolute right-1 top-1 h-4 w-4 text-emerald-400 drop-shadow" />
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        removeImage(img.id)
                      }}
                      className="absolute left-1 top-1 hidden rounded bg-black/50 p-1 text-white group-hover:block hover:bg-rose-600"
                      title="删除"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                  <div className="flex items-center justify-between px-2 py-1">
                    <span className="truncate text-[11px] text-slate-600" title={img.filename}>
                      {img.filename}
                    </span>
                    <span className="ml-1 shrink-0 rounded bg-slate-100 px-1.5 text-[10px] text-slate-500">
                      {count}
                    </span>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      </div>
    </aside>
  )
}
