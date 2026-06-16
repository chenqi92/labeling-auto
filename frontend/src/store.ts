import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { colorForIndex } from './lib/colors'
import type {
  Annotation,
  ApiBox,
  ClassDef,
  ImageItem,
  ModelStatus,
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

interface State {
  images: ImageItem[]
  annotations: Record<string, Annotation[]>
  classes: ClassDef[]
  activeImageId: string | null
  activeClassId: number | null
  selectedAnnId: string | null
  busy: Record<string, boolean>
  model: ModelStatus
  tasks: TaskDef[]
  detect: DetectConfig
  _nextClassId: number

  // images
  addImages: (items: ImageItem[]) => void
  setActiveImage: (id: string | null) => void
  removeImage: (id: string) => void

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
}

export const useStore = create<State>()(
  persist(
    (set, get) => ({
  images: [],
  annotations: {},
  classes: [],
  activeImageId: null,
  activeClassId: null,
  selectedAnnId: null,
  busy: {},
  model: { state: 'unloaded' },
  tasks: [],
  detect: { task: 'detection', query: '', mode: 'slow', maxNewTokens: 1024 },
  _nextClassId: 0,

  addImages: (items) =>
    set((s) => {
      const existing = new Set(s.images.map((i) => i.id))
      const fresh = items.filter((i) => !existing.has(i.id))
      const images = [...s.images, ...fresh]
      const annotations = { ...s.annotations }
      fresh.forEach((i) => {
        if (!annotations[i.id]) annotations[i.id] = []
      })
      return {
        images,
        annotations,
        activeImageId: s.activeImageId ?? (fresh[0]?.id ?? null),
      }
    }),

  setActiveImage: (id) => set({ activeImageId: id, selectedAnnId: null }),

  removeImage: (id) =>
    set((s) => {
      const images = s.images.filter((i) => i.id !== id)
      const annotations = { ...s.annotations }
      delete annotations[id]
      const busy = { ...s.busy }
      delete busy[id]
      return {
        images,
        annotations,
        busy,
        activeImageId: s.activeImageId === id ? (images[0]?.id ?? null) : s.activeImageId,
      }
    }),

  ensureClass: (name) => {
    const trimmed = name.trim() || 'object'
    const found = get().classes.find((c) => c.name === trimmed)
    if (found) return found.id
    return get().addClass(trimmed)
  },

  addClass: (name) => {
    const id = get()._nextClassId
    const cls: ClassDef = { id, name: name.trim() || `class_${id}`, color: colorForIndex(id) }
    set((s) => ({
      classes: [...s.classes, cls],
      _nextClassId: s._nextClassId + 1,
      activeClassId: s.activeClassId ?? id,
    }))
    return id
  },

  renameClass: (id, name) =>
    set((s) => ({
      classes: s.classes.map((c) => (c.id === id ? { ...c, name: name.trim() || c.name } : c)),
    })),

  removeClass: (id) =>
    set((s) => {
      const annotations: Record<string, Annotation[]> = {}
      for (const [imgId, list] of Object.entries(s.annotations)) {
        annotations[imgId] = list.filter((a) => a.classId !== id)
      }
      const classes = s.classes.filter((c) => c.id !== id)
      return {
        classes,
        annotations,
        activeClassId: s.activeClassId === id ? (classes[0]?.id ?? null) : s.activeClassId,
      }
    }),

  setActiveClass: (id) => set({ activeClassId: id }),

  addAnnotation: (imageId, ann) => {
    const id = uid()
    set((s) => ({
      annotations: {
        ...s.annotations,
        [imageId]: [...(s.annotations[imageId] ?? []), { ...ann, id }],
      },
    }))
    return id
  },

  updateAnnotation: (imageId, annId, patch) =>
    set((s) => ({
      annotations: {
        ...s.annotations,
        [imageId]: (s.annotations[imageId] ?? []).map((a) =>
          a.id === annId ? { ...a, ...patch } : a,
        ),
      },
    })),

  removeAnnotation: (imageId, annId) =>
    set((s) => ({
      selectedAnnId: s.selectedAnnId === annId ? null : s.selectedAnnId,
      annotations: {
        ...s.annotations,
        [imageId]: (s.annotations[imageId] ?? []).filter((a) => a.id !== annId),
      },
    })),

  clearAnnotations: (imageId, onlyAuto = false) =>
    set((s) => ({
      selectedAnnId: null,
      annotations: {
        ...s.annotations,
        [imageId]: onlyAuto
          ? (s.annotations[imageId] ?? []).filter((a) => a.source !== 'auto')
          : [],
      },
    })),

  applyDetections: (imageId, boxes, replaceAuto = true) => {
    // 先确保每个 label 都有对应类别（必要时创建）
    boxes.forEach((b) => get().ensureClass(b.label || 'object'))
    const classes = get().classes
    const nameToId = new Map(classes.map((c) => [c.name, c.id]))
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
    set((s) => {
      const prev = s.annotations[imageId] ?? []
      const kept = replaceAuto ? prev.filter((a) => a.source !== 'auto') : prev
      return {
        annotations: { ...s.annotations, [imageId]: [...kept, ...newAnns] },
        images: s.images.map((i) => (i.id === imageId ? { ...i, detected: true } : i)),
      }
    })
  },

  setSelected: (annId) => set({ selectedAnnId: annId }),
  setModel: (m) => set({ model: m }),
  setTasks: (t) => set({ tasks: t }),
  setDetectConfig: (patch) => set((s) => ({ detect: { ...s.detect, ...patch } })),
  setBusy: (imageId, v) => set((s) => ({ busy: { ...s.busy, [imageId]: v } })),
    }),
    {
      name: 'labeling-auto-v1',
      version: 1,
      // 只持久化标注成果（图片在刷新后由后端 /api/images 重新拉取）
      partialize: (s) => ({
        annotations: s.annotations,
        classes: s.classes,
        activeImageId: s.activeImageId,
        activeClassId: s.activeClassId,
        detect: s.detect,
        _nextClassId: s._nextClassId,
      }),
    },
  ),
)
