/** Phase 3-6 API：分割/抠图/元素、模型管理/GPU、任务/批量/训练、设置/导出。 */
import { apiJson, apiRaw } from './lib/http'

// ---------- 分割 / 抠图 / 元素 ----------
export interface SegInstance { label: string; score: number; bbox: number[]; polygon: number[][]; area_pct: number }
export interface MatteResult { image_id: string; png_b64: string; instances: SegInstance[] }
export interface ElementItem { idx: number; name: string; cls: string; area_pct: number; bbox: number[]; thumb_b64: string }

export const segment = (body: { image_id: string; classes?: string[]; conf?: number; variant?: string }) =>
  apiJson<{ image_id: string; instances: SegInstance[] }>('/api/segment', { method: 'POST', body: JSON.stringify(body) })
export const matte = (body: { image_id: string; mode: string; classes?: string[]; box?: number[]; points?: number[][]; point_labels?: number[]; feather?: number }) =>
  apiJson<MatteResult>('/api/matte', { method: 'POST', body: JSON.stringify(body) })
export const elements = (body: { image_id: string; classes?: string[]; granularity?: string; conf?: number }) =>
  apiJson<{ image_id: string; elements: ElementItem[] }>('/api/elements', { method: 'POST', body: JSON.stringify(body) })
export const exportElements = (body: { image_id: string; classes?: string[]; granularity?: string; selected?: number[]; keep_position?: boolean }) =>
  apiRaw('/api/elements/export', { method: 'POST', body: JSON.stringify(body) }).then((r) => r.blob())

// ---------- 模型管理 / GPU ----------
export interface RegistryModel {
  name: string; group: string; kind: string; src: string; vram: number; mutex: boolean
  lang: string; acc: number; speed: number; status: string; downloaded: boolean
}
export interface RegistryResp { models: RegistryModel[]; gpu_total_gb: number; gpu_used_gb: number | null; loaded: string[] }
export interface GpuInfo { gpu_total_gb: number; gpu_used_gb: number | null; gpu_util_pct: number | null; disk_total_tb: number | null; disk_used_tb: number | null; loaded?: string[] }

export const getRegistry = () => apiJson<RegistryResp>('/api/registry')
export const getGpu = () => apiJson<GpuInfo>('/api/gpu')
export const loadModel2 = (name: string) => apiJson<{ ok: boolean }>('/api/registry/load', { method: 'POST', body: JSON.stringify({ name }) })
export const unloadModel2 = (name: string) => apiJson<{ ok: boolean }>('/api/registry/unload', { method: 'POST', body: JSON.stringify({ name }) })

// ---------- 任务 / 批量 / 训练 ----------
export interface JobOut {
  id: string; type: string; capability: string; project_id: string; project_name: string
  status: string; progress: number; total: number; done: number; metric: string; detail: string
  eta: string; who: string; created_at: number; started_at: number | null; finished_at: number | null
}
export interface JobDetail extends JobOut { params: Record<string, unknown>; result: Record<string, unknown>; logs: string[] }
export interface TrainedModel { id: string; name: string; task: string; base: string; metric: string; created_at: number }

export const listJobs = (type?: string) => apiJson<JobOut[]>(`/api/jobs${type ? `?type=${type}` : ''}`)
export const getJob = (id: string) => apiJson<JobDetail>(`/api/jobs/${id}`)
export const stopJob = (id: string) => apiJson<{ ok: boolean }>(`/api/jobs/${id}/stop`, { method: 'POST' })
export const createBatch = (body: { project_id: string; capability: string; engine?: string; query?: string }) =>
  apiJson<JobOut>('/api/batch', { method: 'POST', body: JSON.stringify(body) })
export const listTraining = () => apiJson<JobOut[]>('/api/training')
export const createTraining = (body: { project_id: string; name?: string; task?: string; base?: string; epochs?: number; imgsz?: number; batch?: number; train_ratio?: number }) =>
  apiJson<JobOut>('/api/training', { method: 'POST', body: JSON.stringify(body) })
export const listTrained = () => apiJson<TrainedModel[]>('/api/trained-models')

// ---------- 设置 / 导出 ----------
export const getSettings = () => apiJson<Record<string, string>>('/api/settings')
export const putSettings = (values: Record<string, string>) => apiJson<Record<string, string>>('/api/settings', { method: 'PUT', body: JSON.stringify({ values }) })
export const exportProject = (pid: string, fmt: 'yolo' | 'coco') => apiRaw(`/api/projects/${pid}/export?fmt=${fmt}`).then((r) => r.blob())

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
