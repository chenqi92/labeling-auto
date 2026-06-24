import { useEffect } from 'react'
import { useApp } from './appStore'
import { fetchMe } from './authApi'
import { getModelStatus } from './api'
import { useData } from './dataStore'
import Login from './app/Login'
import Shell from './app/Shell'

export default function App() {
  const token = useApp((s) => s.token)
  const user = useApp((s) => s.user)
  const authReady = useApp((s) => s.authReady)
  const setUser = useApp((s) => s.setUser)
  const setAuthReady = useApp((s) => s.setAuthReady)
  const clearSession = useApp((s) => s.clearSession)

  // 用持久化的 token 验证会话（刷新后保持登录）
  useEffect(() => {
    if (!token) {
      setAuthReady(true)
      return
    }
    fetchMe()
      .then(setUser)
      .catch(() => clearSession())
      .finally(() => setAuthReady(true))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const authed = !!token && !!user

  const loadBootstrap = useData((s) => s.loadBootstrap)
  const setModel = useData((s) => s.setModel)
  const modelState = useData((s) => s.model.state)

  useEffect(() => {
    if (!authed) return
    loadBootstrap()
  }, [authed, loadBootstrap])

  useEffect(() => {
    if (modelState !== 'loading') return
    const t = setInterval(() => {
      getModelStatus().then(setModel).catch(() => undefined)
    }, 1500)
    return () => clearInterval(t)
  }, [modelState, setModel])

  if (!authReady) return null
  if (!authed) return <Login />
  return <Shell />
}
