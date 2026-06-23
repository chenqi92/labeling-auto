import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { colorForIndex } from './lib/colors'
import type {
  Annotation,
  ApiBox,
  ClassDef,
  ImageItem,
  InspectResponse,
  ModelStatus,
  RecognizeResponse,
  TaskDef,
  TaskKey,
} from './types'

function uid(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2)
}

export interface DetectConfig {
  task: TaskKey
  query: string
  mode: 'slow' | 'hybrid' | 'fast'
  maxNewTokens: number
}

const DEFAULT_DETECT: DetectConfig = { task: 'detection', query: '', mode: 'slow', maxNewTokens: 1024 }

/** 一个项目：自带素材、类别、标注、检测配置，彼此隔离。 */
export interface Project {
  id: string
  name: string
  images: ImageItem[]
  annotations: Record<string, Annotation[]>
  classes: ClassDef[]
  nextClassId: number
  detect: DetectConfig
}

function makeProject(name: string): Project {
  return {
    id: uid(),
    name,
    images: [],
    annotations: {},
    classes: [],
    nextClassId: 0,
    detect: { ...DEFAULT_DETECT },
  }
}

// 稳定的空引用，避免 selector 每次返回新数组导致无意义重渲染
const EMPTY_IMAGES: ImageItem[] = []
const EMPTY_CLASSES: ClassDef[] = []
const EMPTY_ANNS: Annotation[] = []

interface State {
  projects: Project[]
  activeProjectId: string | null
  activeImageId: string | null
  activeClassId: number | null
  selectedAnnId: string | null
  busy: Record<string, boolean>
  model: ModelStatus
  tasks: TaskDef[]
  // 巡检结果（瞬态，不持久化）：按 imageId 存最近一次 VQA 问答
  inspections: Record<string, InspectResponse>
  // 文字识别结果（瞬态，不持久化）：按 imageId 存最近一次 OCR 文本
  recognitions: Record<string, RecognizeResponse>

  // projects
  ensureProject: () => void
  addProject: (name?: string) => string
  renameProject: (id: string, name: string) => void
  removeProject: (id: string) => void
  setActiveProject: (id: string) => void

  // images
  addImages: (items: ImageItem[]) => void
  setActiveImage: (id: string | null) => void
  removeImage: (id: string) => void
  importOrphanImages: (items: ImageItem[]) => void

  // classes
  ensureClass: (name: string) => number
  addClass: (name: string) => number
  renameClass: (id: number, name: string) => void
  removeClass: (id: number) => void
  setActiveClass: (id: number | null) => void

  // annotations
  addAnnotation: (imageId: string, ann: Omit<Annotation, 'id'>) => string
  updateAnnotation: (imageId: string, annId: string, patch: Partial<Annotation>) => void
  removeAnnotation: (imageId: string, annId: string) => void
  clearAnnotations: (imageId: string, onlyAuto?: boolean) => void
  applyDetections: (imageId: string, boxes: ApiBox[], replaceAuto?: boolean) => void
  setSelected: (annId: string | null) => void

  // misc
  setModel: (m: ModelStatus) => void
  setTasks: (t: TaskDef[]) => void
  setDetectConfig: (patch: Partial<DetectConfig>) => void
  setBusy: (imageId: string, v: boolean) => void
  setInspection: (imageId: string, res: InspectResponse | null) => void
  setRecognition: (imageId: string, res: RecognizeResponse | null) => void
}

// —— 选择器（组件通过它们读取当前项目的数据）——
export const selectActiveProject = (s: State): Project | null =>
  s.projects.find((p) => p.id === s.activeProjectId) ?? null
export const selectImages = (s: State): ImageItem[] => selectActiveProject(s)?.images ?? EMPTY_IMAGES
export const selectClasses = (s: State): ClassDef[] => selectActiveProject(s)?.classes ?? EMPTY_CLASSES
export const selectDetect = (s: State): DetectConfig => selectActiveProject(s)?.detect ?? DEFAULT_DETECT
export const selectActiveAnnotations = (s: State): Annotation[] => {
  const p = selectActiveProject(s)
  if (!p || !s.activeImageId) return EMPTY_ANNS
  return p.annotations[s.activeImageId] ?? EMPTY_ANNS
}

/** 不可变地更新当前激活的项目。 */
function patchActive(s: State, fn: (p: Project) => Project): Project[] {
  return s.projects.map((p) => (p.id === s.activeProjectId ? fn(p) : p))
}

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      projects: [],
      activeProjectId: null,
      activeImageId: null,
      activeClassId: null,
      selectedAnnId: null,
      busy: {},
      model: { state: 'unloaded' },
      tasks: [],
      inspections: {},
      recognitions: {},

      // —— 项目 ——
      ensureProject: () =>
        set((s) => {
          if (s.projects.length > 0) {
            if (s.activeProjectId && s.projects.some((p) => p.id === s.activeProjectId)) return {}
            const first = s.projects[0]
            return {
              activeProjectId: first.id,
              activeImageId: first.images[0]?.id ?? null,
              activeClassId: first.classes[0]?.id ?? null,
            }
          }
          const p = makeProject('项目 1')
          return { projects: [p], activeProjectId: p.id, activeImageId: null, activeClassId: null }
        }),

      addProject: (name) => {
        const p = makeProject((name && name.trim()) || `项目 ${get().projects.length + 1}`)
        set((s) => ({
          projects: [...s.projects, p],
          activeProjectId: p.id,
          activeImageId: null,
          activeClassId: null,
          selectedAnnId: null,
        }))
        return p.id
      },

      renameProject: (id, name) =>
        set((s) => ({
          projects: s.projects.map((p) => (p.id === id ? { ...p, name: name.trim() || p.name } : p)),
        })),

      removeProject: (id) =>
        set((s) => {
          const projects = s.projects.filter((p) => p.id !== id)
          if (s.activeProjectId !== id) return { projects }
          const next = projects[0]
          if (!next) {
            const fresh = makeProject('项目 1')
            return {
              projects: [fresh],
              activeProjectId: fresh.id,
              activeImageId: null,
              activeClassId: null,
              selectedAnnId: null,
            }
          }
          return {
            projects,
            activeProjectId: next.id,
            activeImageId: next.images[0]?.id ?? null,
            activeClassId: next.classes[0]?.id ?? null,
            selectedAnnId: null,
          }
        }),

      setActiveProject: (id) =>
        set((s) => {
          const p = s.projects.find((pp) => pp.id === id)
          if (!p) return {}
          return {
            activeProjectId: id,
            activeImageId: p.images[0]?.id ?? null,
            activeClassId: p.classes[0]?.id ?? null,
            selectedAnnId: null,
          }
        }),

      // —— 素材 ——
      addImages: (items) =>
        set((s) => {
          let projects = s.projects
          let activeProjectId = s.activeProjectId
          if (projects.length === 0 || !activeProjectId || !projects.some((p) => p.id === activeProjectId)) {
            const p = makeProject('项目 1')
            projects = [...projects, p]
            activeProjectId = p.id
          }
          let firstNewId: string | null = null
          projects = projects.map((p) => {
            if (p.id !== activeProjectId) return p
            const existing = new Set(p.images.map((i) => i.id))
            const fresh = items.filter((i) => !existing.has(i.id))
            if (fresh.length === 0) return p
            firstNewId = firstNewId ?? fresh[0].id
            const annotations = { ...p.annotations }
            fresh.forEach((i) => {
              if (!annotations[i.id]) annotations[i.id] = []
            })
            return { ...p, images: [...p.images, ...fresh], annotations }
          })
          return { projects, activeProjectId, activeImageId: s.activeImageId ?? firstNewId }
        }),

      setActiveImage: (id) => set({ activeImageId: id, selectedAnnId: null }),

      removeImage: (id) =>
        set((s) => {
          const projects = patchActive(s, (p) => {
            if (!p.images.some((i) => i.id === id)) return p
            const annotations = { ...p.annotations }
            delete annotations[id]
            return { ...p, images: p.images.filter((i) => i.id !== id), annotations }
          })
          const busy = { ...s.busy }
          delete busy[id]
          let activeImageId = s.activeImageId
          if (activeImageId === id) {
            const ap = projects.find((p) => p.id === s.activeProjectId)
            activeImageId = ap?.images[0]?.id ?? null
          }
          return { projects, busy, activeImageId }
        }),

      // 把后端存在、但任何项目都未登记的「孤立图片」归位：优先归入持有其标注的项目，否则归入当前项目。
      importOrphanImages: (items) =>
        set((s) => {
          if (items.length === 0) return {}
          let projects = s.projects
          let activeProjectId = s.activeProjectId
          if (projects.length === 0 || !activeProjectId || !projects.some((p) => p.id === activeProjectId)) {
            const p = makeProject('项目 1')
            projects = [...projects, p]
            activeProjectId = p.id
          }
          const known = new Set(projects.flatMap((p) => p.images.map((i) => i.id)))
          const orphans = items.filter((i) => !known.has(i.id))
          if (orphans.length === 0) {
            return projects === s.projects ? {} : { projects, activeProjectId }
          }
          const copies = projects.map((p) => ({ ...p, images: [...p.images] }))
          const activeIdx = Math.max(0, copies.findIndex((p) => p.id === activeProjectId))
          for (const it of orphans) {
            const target =
              copies.find((p) => Object.prototype.hasOwnProperty.call(p.annotations, it.id)) ??
              copies[activeIdx]
            target.images.push(it)
          }
          const ap = copies.find((p) => p.id === activeProjectId)
          return {
            projects: copies,
            activeProjectId,
            activeImageId: s.activeImageId ?? (ap?.images[0]?.id ?? null),
          }
        }),

      // —— 类别 ——
      ensureClass: (name) => {
        const trimmed = name.trim() || 'object'
        const found = selectActiveProject(get())?.classes.find((c) => c.name === trimmed)
        if (found) return found.id
        return get().addClass(trimmed)
      },

      addClass: (name) => {
        let pid = get().activeProjectId
        if (!pid || !get().projects.some((p) => p.id === pid)) {
          get().ensureProject()
          pid = get().activeProjectId
        }
        const proj = get().projects.find((p) => p.id === pid)
        const baseId = proj?.nextClassId ?? 0
        const cls: ClassDef = { id: baseId, name: name.trim() || `class_${baseId}`, color: colorForIndex(baseId) }
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id === pid ? { ...p, classes: [...p.classes, cls], nextClassId: p.nextClassId + 1 } : p,
          ),
          activeClassId: s.activeClassId ?? cls.id,
        }))
        return cls.id
      },

      renameClass: (id, name) =>
        set((s) => ({
          projects: patchActive(s, (p) => ({
            ...p,
            classes: p.classes.map((c) => (c.id === id ? { ...c, name: name.trim() || c.name } : c)),
          })),
        })),

      removeClass: (id) =>
        set((s) => {
          let nextActiveClass = s.activeClassId
          const projects = patchActive(s, (p) => {
            const annotations: Record<string, Annotation[]> = {}
            for (const [imgId, list] of Object.entries(p.annotations)) {
              annotations[imgId] = list.filter((a) => a.classId !== id)
            }
            const classes = p.classes.filter((c) => c.id !== id)
            if (s.activeClassId === id) nextActiveClass = classes[0]?.id ?? null
            return { ...p, classes, annotations }
          })
          return { projects, activeClassId: nextActiveClass }
        }),

      setActiveClass: (id) => set({ activeClassId: id }),

      // —— 标注 ——
      addAnnotation: (imageId, ann) => {
        const id = uid()
        set((s) => ({
          projects: patchActive(s, (p) => ({
            ...p,
            annotations: {
              ...p.annotations,
              [imageId]: [...(p.annotations[imageId] ?? []), { ...ann, id }],
            },
          })),
        }))
        return id
      },

      updateAnnotation: (imageId, annId, patch) =>
        set((s) => ({
          projects: patchActive(s, (p) => ({
            ...p,
            annotations: {
              ...p.annotations,
              [imageId]: (p.annotations[imageId] ?? []).map((a) =>
                a.id === annId ? { ...a, ...patch } : a,
              ),
            },
          })),
        })),

      removeAnnotation: (imageId, annId) =>
        set((s) => ({
          selectedAnnId: s.selectedAnnId === annId ? null : s.selectedAnnId,
          projects: patchActive(s, (p) => ({
            ...p,
            annotations: {
              ...p.annotations,
              [imageId]: (p.annotations[imageId] ?? []).filter((a) => a.id !== annId),
            },
          })),
        })),

      clearAnnotations: (imageId, onlyAuto = false) =>
        set((s) => ({
          selectedAnnId: null,
          projects: patchActive(s, (p) => ({
            ...p,
            annotations: {
              ...p.annotations,
              [imageId]: onlyAuto
                ? (p.annotations[imageId] ?? []).filter((a) => a.source !== 'auto')
                : [],
            },
          })),
        })),

      applyDetections: (imageId, boxes, replaceAuto = true) => {
        // 先确保每个 label 在当前项目里都有对应类别（必要时创建）
        boxes.forEach((b) => get().ensureClass(b.label || 'object'))
        const proj = selectActiveProject(get())
        if (!proj) return
        const nameToId = new Map(proj.classes.map((c) => [c.name, c.id]))
        const newAnns: Annotation[] = boxes.map((b) => ({
          id: uid(),
          classId: nameToId.get(b.label || 'object') ?? 0,
          x1: b.x1,
          y1: b.y1,
          x2: b.x2,
          y2: b.y2,
          score: b.score ?? null,
          source: 'auto',
        }))
        set((s) => ({
          projects: patchActive(s, (p) => {
            const prev = p.annotations[imageId] ?? []
            const kept = replaceAuto ? prev.filter((a) => a.source !== 'auto') : prev
            return {
              ...p,
              annotations: { ...p.annotations, [imageId]: [...kept, ...newAnns] },
              images: p.images.map((i) => (i.id === imageId ? { ...i, detected: true } : i)),
            }
          }),
        }))
      },

      setSelected: (annId) => set({ selectedAnnId: annId }),
      setModel: (m) => set({ model: m }),
      setTasks: (t) => set({ tasks: t }),
      setDetectConfig: (patch) =>
        set((s) => ({ projects: patchActive(s, (p) => ({ ...p, detect: { ...p.detect, ...patch } })) })),
      setBusy: (imageId, v) => set((s) => ({ busy: { ...s.busy, [imageId]: v } })),
      setInspection: (imageId, res) =>
        set((s) => {
          const next = { ...s.inspections }
          if (res) next[imageId] = res
          else delete next[imageId]
          return { inspections: next }
        }),
      setRecognition: (imageId, res) =>
        set((s) => {
          const next = { ...s.recognitions }
          if (res) next[imageId] = res
          else delete next[imageId]
          return { recognitions: next }
        }),
    }),
    {
      name: 'labeling-auto-v1',
      version: 2,
      // 持久化项目（含素材元信息）+ 当前选择；图片像素仍由后端 /api/images 提供
      partialize: (s) => ({
        projects: s.projects,
        activeProjectId: s.activeProjectId,
        activeImageId: s.activeImageId,
        activeClassId: s.activeClassId,
      }),
      // v1 扁平结构（全局 classes/annotations）→ v2 单个「默认项目」
      migrate: (persisted: unknown, version: number) => {
        if (!persisted || typeof persisted !== 'object') return persisted as never
        if (version < 2) {
          const old = persisted as {
            annotations?: Record<string, Annotation[]>
            classes?: ClassDef[]
            detect?: DetectConfig
            activeImageId?: string | null
            activeClassId?: number | null
            _nextClassId?: number
          }
          const classes = old.classes ?? []
          const maxId = classes.reduce((m, c) => Math.max(m, c.id), -1)
          const proj: Project = {
            id: uid(),
            name: '默认项目',
            images: [], // 素材由挂载时 importOrphanImages 从后端回填
            annotations: old.annotations ?? {},
            classes,
            nextClassId: old._nextClassId ?? maxId + 1,
            detect: old.detect ?? { ...DEFAULT_DETECT },
          }
          return {
            projects: [proj],
            activeProjectId: proj.id,
            activeImageId: old.activeImageId ?? null,
            activeClassId: old.activeClassId ?? null,
          }
        }
        return persisted as never
      },
    },
  ),
)
