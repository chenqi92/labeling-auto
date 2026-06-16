export type TaskKey = 'detection' | 'grounding' | 'ocr' | 'gui' | 'point'

export interface ImageItem {
  id: string
  filename: string
  width: number
  height: number
  url: string
  detected?: boolean
}

/** 标注框，坐标为原图像素坐标（左上 x1,y1 → 右下 x2,y2）。 */
export interface Annotation {
  id: string
  classId: number
  x1: number
  y1: number
  x2: number
  y2: number
  score?: number | null
  source: 'auto' | 'manual'
}

export interface ClassDef {
  id: number
  name: string
  color: string
}

export interface TaskDef {
  key: TaskKey
  label: string
  needs_query: boolean
  hint: string
}

export type ModelState = 'unloaded' | 'loading' | 'ready' | 'error'

export interface ModelStatus {
  state: ModelState
  engine?: string
  device?: string
  dtype?: string
  quantization?: string
  message?: string
}

export interface ApiBox {
  x1: number
  y1: number
  x2: number
  y2: number
  label: string
  score?: number | null
}

export interface DetectResponse {
  image_id: string
  boxes: ApiBox[]
  raw: string
  elapsed_ms: number
}
