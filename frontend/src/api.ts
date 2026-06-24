/** 旧版/核心推理 API。统一走 lib/http（自动带 Bearer 令牌）。 */
import { apiJson, apiRaw } from './lib/http'
import type {
  DetectResponse,
  EngineDef,
  ImageItem,
  InspectHealth,
  InspectResponse,
  ModelStatus,
  RecognizeResponse,
  TaskDef,
  TaskKey,
} from './types'

export async function uploadImages(files: FileList | File[]): Promise<ImageItem[]> {
  const form = new FormData()
  Array.from(files).forEach((f) => form.append('files', f))
  return apiJson<ImageItem[]>('/api/images', { method: 'POST', body: form })
}

export const listImages = () => apiJson<ImageItem[]>('/api/images')

export async function getTasks(): Promise<TaskDef[]> {
  const body = await apiJson<{ tasks: TaskDef[] }>('/api/tasks')
  return body.tasks
}

export async function getEngines(): Promise<EngineDef[]> {
  const body = await apiJson<{ engines: EngineDef[] }>('/api/engines')
  return body.engines
}

export const getModelStatus = () => apiJson<ModelStatus>('/api/model/status')
export const loadModel = () => apiJson<ModelStatus>('/api/model/load', { method: 'POST' })

export interface DetectParams {
  image_id: string
  query: string
  task: TaskKey
  engine?: string
  mode?: string | null
  max_new_tokens?: number | null
}

export const detect = (params: DetectParams) =>
  apiJson<DetectResponse>('/api/detect', { method: 'POST', body: JSON.stringify(params) })

export const inspect = (params: { image_id: string; query: string }) =>
  apiJson<InspectResponse>('/api/inspect', { method: 'POST', body: JSON.stringify(params) })

export const inspectHealth = () => apiJson<InspectHealth>('/api/inspect/health')

export const recognizeText = (params: { image_id: string }) =>
  apiJson<RecognizeResponse>('/api/recognize', { method: 'POST', body: JSON.stringify(params) })

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
  const res = await apiRaw('/api/export/yolo', { method: 'POST', body: JSON.stringify(params) })
  return res.blob()
}
