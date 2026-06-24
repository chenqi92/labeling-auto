import { useEffect } from 'react'
import { useApp } from './appStore'
import { fetchMe } from './authApi'
import { getEngines, getModelStatus, getTasks, listImages } from './api'
import { useStore } from './store'
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
    // 仅在挂载时跑一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const authed = !!token && !!user

  // 项目数据 store 初始化（登录后）
  const ensureProject = useStore((s) => s.ensureProject)
  const importOrphanImages = useStore((s) => s.importOrphanImages)
  const setTasks = useStore((s) => s.setTasks)
  const setEngines = useStore((s) => s.setEngines)
  const setModel = useStore((s) => s.setModel)
  const modelState = useStore((s) => s.model.state)

  useEffect(() => {
    if (!authed) return
    ensureProject()
    getTasks().then(setTasks).catch(() => undefined)
    getEngines().then(setEngines).catch(() => undefined)
    getModelStatus().then(setModel).catch(() => undefined)
    listImages().then(importOrphanImages).catch(() => undefined)
  }, [authed, ensureProject, importOrphanImages, setTasks, setEngines, setModel])

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
