/** 应用外壳状态：账户会话 + 视图路由 + 主题 + 顶栏菜单。
 *  与项目数据 store（store.ts）分离，避免影响其持久化与迁移。 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { setAuthToken } from './lib/http'
import type { Capability, Theme, User, ViewKey } from './types'

type MenuKey = 'gpu' | 'user' | 'notif' | 'proj' | null

interface AppState {
  // 会话
  token: string | null
  user: User | null
  authReady: boolean // 是否已尝试用持久化 token 拉取 /me

  // 路由
  view: ViewKey
  capability: Capability

  // 外观
  theme: Theme

  // 顶栏弹层（同时只开一个，便于点击外部关闭）
  openMenu: MenuKey

  // actions
  setSession: (token: string, user: User) => void
  setUser: (user: User | null) => void
  setAuthReady: (v: boolean) => void
  clearSession: () => void
  openCapability: (c: Capability) => void
  goView: (v: ViewKey) => void
  setTheme: (t: Theme) => void
  toggleTheme: () => void
  setMenu: (m: MenuKey) => void
  closeMenus: () => void
}

export const useApp = create<AppState>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      authReady: false,
      view: 'workbench',
      capability: 'detect',
      theme: 'dark',
      openMenu: null,

      setSession: (token, user) => {
        setAuthToken(token)
        set({ token, user, authReady: true })
      },
      setUser: (user) => set({ user }),
      setAuthReady: (v) => set({ authReady: v }),
      clearSession: () => {
        setAuthToken(null)
        set({ token: null, user: null, openMenu: null, authReady: true })
      },
      openCapability: (c) => set({ view: 'workbench', capability: c, openMenu: null }),
      goView: (v) => set({ view: v, openMenu: null }),
      setTheme: (t) => set({ theme: t }),
      toggleTheme: () => set({ theme: get().theme === 'dark' ? 'light' : 'dark' }),
      setMenu: (m) => set((s) => ({ openMenu: s.openMenu === m ? null : m })),
      closeMenus: () => set({ openMenu: null }),
    }),
    {
      name: 'vislab-app-v1',
      partialize: (s) => ({ token: s.token, theme: s.theme, view: s.view, capability: s.capability }),
      onRehydrateStorage: () => (state) => {
        // 持久化 token 恢复后立刻注入 http 层
        if (state?.token) setAuthToken(state.token)
      },
    },
  ),
)
