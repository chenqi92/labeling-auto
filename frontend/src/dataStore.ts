/** 后端为真源的项目数据 store（不本地持久化）。
 *  承载项目/图片/类别/标注/数据集 + 检测模型状态，供新工作台与各页面使用。 */
import { create } from 'zustand'
import * as papi from './projectApi'
import { getEngines, getModelStatus, getTasks } from './api'
import type { Ann, Cls, DatasetVersion, EngineDef, InspectResponse, ModelStatus, ProjectInfo, ProjImage, RecognizeResponse, TaskDef } from './types'

const ACTIVE_KEY = 'vislab-active-project'

interface DataState {
  projects: ProjectInfo[]
  activeProjectId: string | null
  images: ProjImage[]
  classes: Cls[]
  datasets: DatasetVersion[]
  activeImageId: string | null
  anns: Record<string, Ann[]> // 按 imageId 缓存
  selectedIdx: number | null // 当前图选中的标注序号
  activeClassId: number | null // 新画框归入的类别
  busy: Record<string, boolean> // 按 imageId 的推理中
  uploading: boolean

  // 检测模型
  model: ModelStatus
  tasks: TaskDef[]
  engines: EngineDef[]

  // VQA / OCR 结果（瞬态，按 imageId）
  inspections: Record<string, InspectResponse>
  recognitions: Record<string, RecognizeResponse>

  loadProjects: () => Promise<void>
  loadBootstrap: () => Promise<void>
  setActiveProject: (id: string) => Promise<void>
  loadProjectData: (pid: string) => Promise<void>
  createProject: (name: string) => Promise<string | null>
  renameProject: (id: string, name: string) => Promise<void>
  deleteProject: (id: string) => Promise<void>

  uploadFiles: (files: FileList | File[]) => Promise<void>
  removeImage: (iid: string) => Promise<void>
  setActiveImage: (iid: string | null) => Promise<void>

  addClass: (name: string) => Promise<Cls | null>
  updateClass: (idx: number, patch: { name?: string; color?: string }) => Promise<void>
  removeClass: (idx: number) => Promise<void>

  loadAnnotations: (iid: string) => Promise<Ann[]>
  saveAnnotations: (iid: string, anns: Ann[]) => Promise<void>
  applyDetections: (iid: string, boxes: { x1: number; y1: number; x2: number; y2: number; label: string; score?: number | null }[]) => Promise<void>

  snapshotDataset: (name?: string, split?: string) => Promise<void>

  setModel: (m: ModelStatus) => void
  setBusy: (iid: string, v: boolean) => void
  setSelectedIdx: (i: number | null) => void
  setActiveClassId: (i: number | null) => void
  setInspection: (iid: string, r: InspectResponse) => void
  setRecognition: (iid: string, r: RecognizeResponse) => void
  refreshProjectCounts: () => Promise<void>
}

export const useData = create<DataState>()((set, get) => ({
  projects: [],
  activeProjectId: null,
  images: [],
  classes: [],
  datasets: [],
  activeImageId: null,
  anns: {},
  selectedIdx: null,
  activeClassId: null,
  busy: {},
  uploading: false,
  model: { state: 'unloaded' },
  tasks: [],
  engines: [],
  inspections: {},
  recognitions: {},

  loadProjects: async () => {
    const projects = await papi.listProjects()
    set({ projects })
    let active = get().activeProjectId
    if (!active || !projects.some((p) => p.id === active)) {
      active = localStorage.getItem(ACTIVE_KEY)
      if (!active || !projects.some((p) => p.id === active)) active = projects[0]?.id ?? null
    }
    if (active) await get().setActiveProject(active)
  },

  loadBootstrap: async () => {
    getTasks().then((tasks) => set({ tasks })).catch(() => undefined)
    getEngines().then((engines) => set({ engines })).catch(() => undefined)
    getModelStatus().then((model) => set({ model })).catch(() => undefined)
    await get().loadProjects()
  },

  setActiveProject: async (id) => {
    localStorage.setItem(ACTIVE_KEY, id)
    set({ activeProjectId: id, activeImageId: null, images: [], classes: [], datasets: [], anns: {} })
    await get().loadProjectData(id)
  },

  loadProjectData: async (pid) => {
    const [images, classes, datasets] = await Promise.all([
      papi.listImages(pid),
      papi.listClasses(pid),
      papi.listDatasets(pid),
    ])
    set({ images, classes, datasets })
    const first = images[0]?.id ?? null
    if (first) await get().setActiveImage(first)
  },

  createProject: async (name) => {
    try {
      const p = await papi.createProject(name)
      await get().loadProjects()
      await get().setActiveProject(p.id)
      return p.id
    } catch {
      return null
    }
  },

  renameProject: async (id, name) => {
    await papi.renameProject(id, name)
    set((s) => ({ projects: s.projects.map((p) => (p.id === id ? { ...p, name } : p)) }))
  },

  deleteProject: async (id) => {
    await papi.deleteProject(id)
    const wasActive = get().activeProjectId === id
    await get().loadProjects()
    if (wasActive) {
      const next = get().projects[0]?.id ?? null
      if (next) await get().setActiveProject(next)
      else set({ activeProjectId: null, images: [], classes: [], datasets: [] })
    }
  },

  uploadFiles: async (files) => {
    const pid = get().activeProjectId
    if (!pid || files.length === 0) return
    set({ uploading: true })
    try {
      const added = await papi.uploadImages(pid, files)
      set((s) => ({ images: [...s.images, ...added] }))
      if (!get().activeImageId && added[0]) await get().setActiveImage(added[0].id)
      await get().refreshProjectCounts()
    } finally {
      set({ uploading: false })
    }
  },

  removeImage: async (iid) => {
    await papi.deleteImage(iid)
    set((s) => {
      const images = s.images.filter((i) => i.id !== iid)
      const anns = { ...s.anns }
      delete anns[iid]
      const activeImageId = s.activeImageId === iid ? images[0]?.id ?? null : s.activeImageId
      return { images, anns, activeImageId }
    })
    await get().refreshProjectCounts()
  },

  setActiveImage: async (iid) => {
    set({ activeImageId: iid, selectedIdx: null })
    if (iid && !get().anns[iid]) await get().loadAnnotations(iid)
  },

  addClass: async (name) => {
    const pid = get().activeProjectId
    if (!pid) return null
    const existing = get().classes.find((c) => c.name === name)
    if (existing) return existing
    const c = await papi.addClass(pid, name)
    set((s) => ({ classes: [...s.classes, c] }))
    return c
  },

  updateClass: async (idx, patch) => {
    const pid = get().activeProjectId
    if (!pid) return
    const c = await papi.updateClass(pid, idx, patch)
    set((s) => ({ classes: s.classes.map((x) => (x.id === idx ? c : x)) }))
  },

  removeClass: async (idx) => {
    const pid = get().activeProjectId
    if (!pid) return
    await papi.deleteClass(pid, idx)
    set((s) => {
      const anns = { ...s.anns }
      for (const k of Object.keys(anns)) anns[k] = anns[k].filter((a) => a.class_idx !== idx)
      return { classes: s.classes.filter((c) => c.id !== idx), anns }
    })
  },

  loadAnnotations: async (iid) => {
    const anns = await papi.getAnnotations(iid)
    set((s) => ({ anns: { ...s.anns, [iid]: anns } }))
    return anns
  },

  saveAnnotations: async (iid, list) => {
    const saved = await papi.setAnnotations(iid, list)
    set((s) => ({
      anns: { ...s.anns, [iid]: saved },
      images: s.images.map((i) => (i.id === iid ? { ...i, boxes: saved.length, status: saved.length ? 'done' : 'todo' } : i)),
    }))
  },

  applyDetections: async (iid, boxes) => {
    const pid = get().activeProjectId
    if (!pid) return
    // 确保每个 label 有类别
    let classes = get().classes
    const labels = Array.from(new Set(boxes.map((b) => b.label || 'object')))
    for (const lb of labels) {
      if (!classes.find((c) => c.name === lb)) {
        const c = await papi.addClass(pid, lb)
        classes = [...classes, c]
      }
    }
    set({ classes })
    const nameToIdx = new Map(classes.map((c) => [c.name, c.id]))
    const existing = get().anns[iid] ?? (await get().loadAnnotations(iid))
    const keptManual = existing.filter((a) => a.source !== 'auto')
    const newAuto: Ann[] = boxes.map((b) => ({
      class_idx: nameToIdx.get(b.label || 'object') ?? 0,
      x1: b.x1, y1: b.y1, x2: b.x2, y2: b.y2,
      score: b.score ?? null, source: 'auto',
    }))
    await get().saveAnnotations(iid, [...keptManual, ...newAuto])
    await get().refreshProjectCounts()
  },

  snapshotDataset: async (name, split = '80/20') => {
    const pid = get().activeProjectId
    if (!pid) return
    const ds = await papi.snapshotDataset(pid, name, split)
    set((s) => ({ datasets: [ds, ...s.datasets] }))
  },

  setModel: (m) => set({ model: m }),
  setBusy: (iid, v) => set((s) => ({ busy: { ...s.busy, [iid]: v } })),
  setSelectedIdx: (i) => set({ selectedIdx: i }),
  setActiveClassId: (i) => set({ activeClassId: i }),
  setInspection: (iid, r) => set((s) => ({ inspections: { ...s.inspections, [iid]: r } })),
  setRecognition: (iid, r) => set((s) => ({ recognitions: { ...s.recognitions, [iid]: r } })),

  refreshProjectCounts: async () => {
    try {
      const projects = await papi.listProjects()
      set({ projects })
    } catch {
      /* ignore */
    }
  },
}))

// 选择器
export const selProject = (s: DataState): ProjectInfo | null =>
  s.projects.find((p) => p.id === s.activeProjectId) ?? null
export const selActiveAnns = (s: DataState): Ann[] =>
  s.activeImageId ? s.anns[s.activeImageId] ?? [] : []
export const selActiveImage = (s: DataState): ProjImage | null =>
  s.images.find((i) => i.id === s.activeImageId) ?? null
