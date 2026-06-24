/** 账户 / 会话 / 用户管理 API。 */
import { apiJson } from './lib/http'
import type { Role, User } from './types'

export interface LoginResponse {
  token: string
  user: User
}

export function login(username: string, password: string): Promise<LoginResponse> {
  return apiJson<LoginResponse>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  })
}

export function fetchMe(): Promise<User> {
  return apiJson<User>('/api/auth/me')
}

export function logout(): Promise<{ ok: boolean }> {
  return apiJson<{ ok: boolean }>('/api/auth/logout', { method: 'POST' })
}

export function listUsers(): Promise<User[]> {
  return apiJson<User[]>('/api/users')
}

export function createUser(req: {
  username: string
  password: string
  name?: string
  role?: Role
}): Promise<User> {
  return apiJson<User>('/api/users', { method: 'POST', body: JSON.stringify(req) })
}

export function updateUser(
  id: number,
  req: { name?: string; role?: Role; password?: string },
): Promise<User> {
  return apiJson<User>(`/api/users/${id}`, { method: 'PATCH', body: JSON.stringify(req) })
}

export function deleteUser(id: number): Promise<{ ok: boolean }> {
  return apiJson<{ ok: boolean }>(`/api/users/${id}`, { method: 'DELETE' })
}
