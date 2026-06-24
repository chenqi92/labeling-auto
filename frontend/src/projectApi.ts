/** 项目 / 图片 / 类别 / 标注 / 数据集版本 API（后端为真源）。 */
import { apiJson } from './lib/http'
import type { Ann, Cls, DatasetVersion, ProjectInfo, ProjImage } from './types'

// 项目
export const listProjects = () => apiJson<ProjectInfo[]>('/api/projects')
export const createProject = (name: string) =>
  apiJson<ProjectInfo>('/api/projects', { method: 'POST', body: JSON.stringify({ name }) })
export const renameProject = (id: string, name: string) =>
  apiJson<ProjectInfo>(`/api/projects/${id}`, { method: 'PATCH', body: JSON.stringify({ name }) })
export const deleteProject = (id: string) =>
  apiJson<{ ok: boolean }>(`/api/projects/${id}`, { method: 'DELETE' })

// 图片
export const listImages = (pid: string) => apiJson<ProjImage[]>(`/api/projects/${pid}/images`)
export async function uploadImages(pid: string, files: FileList | File[]): Promise<ProjImage[]> {
  const form = new FormData()
  Array.from(files).forEach((f) => form.append('files', f))
  return apiJson<ProjImage[]>(`/api/projects/${pid}/images`, { method: 'POST', body: form })
}
export const deleteImage = (iid: string) =>
  apiJson<{ ok: boolean }>(`/api/images/${iid}`, { method: 'DELETE' })

// 类别
export const listClasses = (pid: string) => apiJson<Cls[]>(`/api/projects/${pid}/classes`)
export const addClass = (pid: string, name: string, color?: string) =>
  apiJson<Cls>(`/api/projects/${pid}/classes`, { method: 'POST', body: JSON.stringify({ name, color }) })
export const updateClass = (pid: string, idx: number, patch: { name?: string; color?: string }) =>
  apiJson<Cls>(`/api/projects/${pid}/classes/${idx}`, { method: 'PATCH', body: JSON.stringify(patch) })
export const deleteClass = (pid: string, idx: number) =>
  apiJson<{ ok: boolean }>(`/api/projects/${pid}/classes/${idx}`, { method: 'DELETE' })

// 标注
export const getAnnotations = (iid: string) => apiJson<Ann[]>(`/api/images/${iid}/annotations`)
export const setAnnotations = (iid: string, annotations: Ann[]) =>
  apiJson<Ann[]>(`/api/images/${iid}/annotations`, { method: 'PUT', body: JSON.stringify({ annotations }) })

// 数据集版本
export const listDatasets = (pid: string) => apiJson<DatasetVersion[]>(`/api/projects/${pid}/datasets`)
export const snapshotDataset = (pid: string, name?: string, split = '80/20') =>
  apiJson<DatasetVersion>(`/api/projects/${pid}/datasets`, { method: 'POST', body: JSON.stringify({ name, split }) })
