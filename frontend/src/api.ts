import type {
  DetectResponse,
  ImageItem,
  InspectHealth,
  InspectResponse,
  ModelStatus,
  RecognizeResponse,
  TaskDef,
  TaskKey,
} from './types'

async function jsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail = res.statusText
    try {
      const body = await res.json()
      detail = body.detail || detail
    } catch {
      /* ignore */
    }
    throw new Error(detail)
  }
  return res.json() as Promise<T>
}

export async function uploadImages(files: FileList | File[]): Promise<ImageItem[]> {
  const form = new FormData()
  Array.from(files).forEach((f) => form.append('files', f))
  const res = await fetch('/api/images', { method: 'POST', body: form })
  return jsonOrThrow<ImageItem[]>(res)
}

export async function listImages(): Promise<ImageItem[]> {
  const res = await fetch('/api/images')
  return jsonOrThrow<ImageItem[]>(res)
}

export async function getTasks(): Promise<TaskDef[]> {
  const res = await fetch('/api/tasks')
  const body = await jsonOrThrow<{ tasks: TaskDef[] }>(res)
  return body.tasks
}

export async function getModelStatus(): Promise<ModelStatus> {
  const res = await fetch('/api/model/status')
  return jsonOrThrow<ModelStatus>(res)
}

export async function loadModel(): Promise<ModelStatus> {
  const res = await fetch('/api/model/load', { method: 'POST' })
  return jsonOrThrow<ModelStatus>(res)
}

export interface DetectParams {
  image_id: string
  query: string
  task: TaskKey
  mode?: string | null
  max_new_tokens?: number | null
}

export async function detect(params: DetectParams): Promise<DetectResponse> {
  const res = await fetch('/api/detect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return jsonOrThrow<DetectResponse>(res)
}

export async function inspect(params: { image_id: string; query: string }): Promise<InspectResponse> {
  const res = await fetch('/api/inspect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return jsonOrThrow<InspectResponse>(res)
}

export async function inspectHealth(): Promise<InspectHealth> {
  const res = await fetch('/api/inspect/health')
  return jsonOrThrow<InspectHealth>(res)
}

export async function recognizeText(params: { image_id: string }): Promise<RecognizeResponse> {
  const res = await fetch('/api/recognize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return jsonOrThrow<RecognizeResponse>(res)
}

export interface ExportItem {
  image_id: string
  annotations: { class_id: number; x1: number; y1: number; x2: number; y2: number }[]
}

export interface ExportParams {
  dataset_name: string
  classes: string[]
  items: ExportItem[]
  train_ratio?: number | null
}

export async function exportYolo(params: ExportParams): Promise<Blob> {
  const res = await fetch('/api/export/yolo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  if (!res.ok) {
    let detail = res.statusText
    try {
      detail = (await res.json()).detail || detail
    } catch {
      /* ignore */
    }
    throw new Error(detail)
  }
  return res.blob()
}
