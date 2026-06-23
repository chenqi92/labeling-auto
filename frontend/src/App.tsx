import { useEffect, useState } from 'react'
import TopBar from './components/TopBar'
import Sidebar from './components/Sidebar'
import DetectBar from './components/DetectBar'
import CanvasEditor from './components/CanvasEditor'
import ClassPanel from './components/ClassPanel'
import AnnotationList from './components/AnnotationList'
import InspectPanel from './components/InspectPanel'
import RecognizePanel from './components/RecognizePanel'
import ExportDialog from './components/ExportDialog'
import { getEngines, getModelStatus, getTasks, listImages } from './api'
import { useStore } from './store'

export default function App() {
  const setTasks = useStore((s) => s.setTasks)
  const setEngines = useStore((s) => s.setEngines)
  const setModel = useStore((s) => s.setModel)
  const ensureProject = useStore((s) => s.ensureProject)
  const importOrphanImages = useStore((s) => s.importOrphanImages)
  const modelState = useStore((s) => s.model.state)
  const [exportOpen, setExportOpen] = useState(false)

  // 初始化：保证至少有一个项目；拉任务列表 + 模型状态；把后端已存、未登记到任何项目的图片归位
  useEffect(() => {
    ensureProject()
    getTasks().then(setTasks).catch(() => undefined)
    getEngines().then(setEngines).catch(() => undefined)
    getModelStatus().then(setModel).catch(() => undefined)
    listImages().then(importOrphanImages).catch(() => undefined)
  }, [setTasks, setEngines, setModel, ensureProject, importOrphanImages])

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
        <aside className="flex w-80 flex-col overflow-y-auto border-l border-slate-200 bg-white">
          <InspectPanel />
          <RecognizePanel />
          <ClassPanel />
          <AnnotationList />
        </aside>
      </div>
      <ExportDialog open={exportOpen} onClose={() => setExportOpen(false)} />
    </div>
  )
}
