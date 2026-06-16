import { useEffect, useState } from 'react'
import TopBar from './components/TopBar'
import Sidebar from './components/Sidebar'
import DetectBar from './components/DetectBar'
import CanvasEditor from './components/CanvasEditor'
import ClassPanel from './components/ClassPanel'
import AnnotationList from './components/AnnotationList'
import ExportDialog from './components/ExportDialog'
import { getModelStatus, getTasks, listImages } from './api'
import { useStore } from './store'

export default function App() {
  const setTasks = useStore((s) => s.setTasks)
  const setModel = useStore((s) => s.setModel)
  const addImages = useStore((s) => s.addImages)
  const modelState = useStore((s) => s.model.state)
  const [exportOpen, setExportOpen] = useState(false)

  // 初始化：任务列表 + 模型状态 + 后端已存图片（刷新后恢复列表，配合 localStorage 里的标注）
  useEffect(() => {
    getTasks().then(setTasks).catch(() => undefined)
    getModelStatus().then(setModel).catch(() => undefined)
    listImages().then(addImages).catch(() => undefined)
  }, [setTasks, setModel, addImages])

  // 模型加载中时轮询状态
  useEffect(() => {
    if (modelState !== 'loading') return
    const t = setInterval(() => {
      getModelStatus().then(setModel).catch(() => undefined)
    }, 1500)
    return () => clearInterval(t)
  }, [modelState, setModel])

  return (
    <div className="flex h-screen flex-col bg-slate-100 text-slate-800">
      <TopBar onExport={() => setExportOpen(true)} />
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <main className="flex min-w-0 flex-1 flex-col">
          <DetectBar />
          <div className="min-h-0 flex-1">
            <CanvasEditor />
          </div>
        </main>
        <aside className="flex w-80 flex-col border-l border-slate-200 bg-white">
          <ClassPanel />
          <AnnotationList />
        </aside>
      </div>
      <ExportDialog open={exportOpen} onClose={() => setExportOpen(false)} />
    </div>
  )
}
