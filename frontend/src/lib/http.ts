/** 统一 HTTP 封装：自动带上 Bearer 令牌、统一错误信息。
 *  令牌由 appStore 在登录/登出/水合时通过 setAuthToken 同步进来。 */

let authToken: string | null = null

export function setAuthToken(token: string | null): void {
  authToken = token
}
export function getAuthToken(): string | null {
  return authToken
}

function authHeaders(extra?: HeadersInit): HeadersInit {
  const h: Record<string, string> = {}
  if (extra) Object.assign(h, extra)
  if (authToken) h['Authorization'] = `Bearer ${authToken}`
  return h
}

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

async function throwForStatus(res: Response): Promise<never> {
  let detail = res.statusText
  try {
    const body = await res.json()
    detail = (body && (body.detail || body.message)) || detail
  } catch {
    /* ignore */
  }
  throw new ApiError(detail, res.status)
}

/** 发起请求并返回 JSON。失败抛 ApiError（含 status）。 */
export async function apiJson<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const isForm = opts.body instanceof FormData
  const res = await fetch(path, {
    ...opts,
    headers: authHeaders(isForm ? opts.headers : { 'Content-Type': 'application/json', ...opts.headers }),
  })
  if (!res.ok) await throwForStatus(res)
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

/** 返回原始 Response（用于下载 blob 等）。 */
export async function apiRaw(path: string, opts: RequestInit = {}): Promise<Response> {
  const isForm = opts.body instanceof FormData
  const res = await fetch(path, {
    ...opts,
    headers: authHeaders(isForm ? opts.headers : opts.headers),
  })
  if (!res.ok) await throwForStatus(res)
  return res
}
