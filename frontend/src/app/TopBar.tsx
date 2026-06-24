/** 顶栏：logo · 项目切换 · 搜索 · GPU 状态灯 · 通知 · 主题 · 用户菜单。
 *  项目数据来自 store.ts；会话/主题/菜单来自 appStore。GPU 显存看板在 Phase 4 接真实遥测。 */
import { useApp } from '../appStore'
import { useData } from '../dataStore'
import { logout as apiLogout } from '../authApi'
import { Icon, Svg } from './ui'

export default function TopBar() {
  const { user, theme, openMenu } = useApp()
  const toggleTheme = useApp((s) => s.toggleTheme)
  const setMenu = useApp((s) => s.setMenu)
  const goView = useApp((s) => s.goView)
  const clearSession = useApp((s) => s.clearSession)

  const projects = useData((s) => s.projects)
  const activeProjectId = useData((s) => s.activeProjectId)
  const setActiveProject = useData((s) => s.setActiveProject)
  const model = useData((s) => s.model)
  const imgQuery = useData((s) => s.imgQuery)
  const setImgQuery = useData((s) => s.setImgQuery)

  const curProject = projects.find((p) => p.id === activeProjectId) ?? projects[0]
  const gpuColor = model.state === 'ready' ? 'var(--green)' : model.state === 'loading' ? 'var(--amber)' : model.state === 'error' ? 'var(--red)' : 'var(--text3)'
  const gpuStatus = model.state === 'ready' ? '空闲就绪' : model.state === 'loading' ? '模型加载中' : model.state === 'error' ? '错误' : '未加载'

  const doLogout = async () => {
    try {
      await apiLogout()
    } catch {
      /* ignore */
    }
    clearSession()
  }

  return (
    <div style={{ height: 52, flex: '0 0 52px', background: 'var(--chrome)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', padding: '0 14px', gap: 14, position: 'relative', zIndex: 40, overflow: 'hidden' }}>
      <span style={{ position: 'absolute', bottom: 0, width: '13%', height: 1, background: 'linear-gradient(90deg,transparent,var(--accent),transparent)', opacity: 0.55, animation: 'barsweep 7s linear infinite' }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 28, height: 28, borderRadius: 7, background: 'linear-gradient(135deg,#19c8b8,#0f8a80)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 14px rgba(25,200,184,.35)' }}>
          <Svg path='<path d="M3 8l9-5 9 5-9 5-9-5z"/><path d="M3 12l9 5 9-5M3 16l9 5 9-5"/>' size={17} sw={1.8} color="#04140f" />
        </div>
        <div style={{ fontFamily: 'var(--display)', fontSize: 17, fontWeight: 700, letterSpacing: '.2px' }}>VisLab</div>
      </div>

      <div style={{ width: 1, height: 22, background: 'var(--border)' }} />

      {/* 项目切换 */}
      <div style={{ position: 'relative' }}>
        <button onClick={() => setMenu('proj')} style={{ display: 'flex', alignItems: 'center', gap: 9, background: 'var(--panel2)', border: '1px solid var(--border)', borderRadius: 8, padding: '7px 12px', cursor: 'pointer', color: 'var(--text)' }}>
          <Svg path='<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18"/>' size={15} color="var(--accent)" />
          <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.1, whiteSpace: 'nowrap' }}>{curProject?.name ?? '无项目'}</div>
          <span style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>{curProject?.images ?? 0}图</span>
          <Icon name="chevron" size={13} color="var(--text3)" sw={2} />
        </button>
        {openMenu === 'proj' && (
          <div style={{ position: 'absolute', top: 46, left: 0, width: 320, background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 11, boxShadow: 'var(--shadow)', padding: 7, animation: 'popin .12s ease', zIndex: 50 }}>
            <div style={{ fontSize: 11, color: 'var(--text3)', padding: '7px 9px 5px' }}>切换项目</div>
            {projects.map((p) => (
              <button key={p.id} onClick={() => { setActiveProject(p.id); useApp.getState().closeMenus() }} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'transparent', border: 'none', borderRadius: 8, padding: '9px', cursor: 'pointer', color: 'var(--text)' }}>
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{p.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 1 }}>{p.images} 图 · {p.classes} 类</div>
                </div>
                {p.id === activeProjectId && <Svg path='<path d="M5 12l5 5 9-10"/>' size={15} color="var(--accent)" sw={2.2} />}
              </button>
            ))}
            <div style={{ height: 1, background: 'var(--border)', margin: '6px 4px' }} />
            <button onClick={() => goView('projects')} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 9, background: 'transparent', border: 'none', borderRadius: 8, padding: 9, cursor: 'pointer', color: 'var(--accent)', fontSize: 13, fontWeight: 500 }}>
              <Icon name="plus" size={15} color="currentColor" sw={2} />新建 / 管理项目
            </button>
          </div>
        )}
      </div>

      <div style={{ flex: 1 }} />

      {/* 搜索：按文件名过滤当前项目图片 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--panel2)', border: '1px solid var(--border)', borderRadius: 8, padding: '7px 11px', width: 230 }}>
        <Icon name="search" size={14} color="var(--text3)" sw={1.8} />
        <input value={imgQuery} onChange={(e) => setImgQuery(e.target.value)} placeholder="搜索图片（文件名）" style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'var(--text)', fontSize: 12.5 }} />
      </div>

      {/* GPU 状态灯 */}
      <div style={{ position: 'relative' }}>
        <button onClick={() => setMenu('gpu')} style={{ display: 'flex', alignItems: 'center', gap: 9, background: 'var(--panel2)', border: '1px solid var(--border)', borderRadius: 8, padding: '7px 11px 7px 10px', cursor: 'pointer', color: 'var(--text)' }}>
          <span style={{ width: 9, height: 9, borderRadius: '50%', background: gpuColor }} />
          <span style={{ fontSize: 12, fontWeight: 600, fontFamily: 'var(--display)' }}>GPU</span>
          <span style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 11 }}>
            {[0, 0.22, 0.44].map((d) => (
              <span key={d} style={{ width: 2.5, height: '100%', background: gpuColor, borderRadius: 1, transformOrigin: 'bottom', animation: `hbar 1.1s ease-in-out infinite`, animationDelay: `${d}s` }} />
            ))}
          </span>
        </button>
        {openMenu === 'gpu' && (
          <div style={{ position: 'absolute', top: 46, right: 0, width: 320, background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 12, boxShadow: 'var(--shadow)', padding: 15, animation: 'popin .12s ease', zIndex: 50 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 13 }}>
              <div style={{ fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: gpuColor }} />{gpuStatus}</div>
              <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>NVIDIA · 单卡</div>
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--text3)', lineHeight: 1.6, marginBottom: 12 }}>
              检测引擎：{model.state === 'ready' ? `${model.engine || 'LocateAnything'} 已就绪（${model.device || 'cuda'} · ${model.dtype || ''}）` : '未常驻'}
            </div>
            <div style={{ fontSize: 11, color: 'var(--amber)', background: 'var(--amber-g)', borderRadius: 7, padding: '8px 10px', lineHeight: 1.5 }}>实时显存看板将在「模型管理」接入逐模型占用与互斥关系。</div>
            <button onClick={() => goView('registry')} style={{ width: '100%', marginTop: 11, background: 'var(--panel2)', border: '1px solid var(--border)', borderRadius: 8, padding: 9, fontSize: 12.5, color: 'var(--text)', cursor: 'pointer' }}>打开显存看板 / 模型管理</button>
          </div>
        )}
      </div>

      {/* 通知 */}
      <button onClick={() => goView('jobs')} title="任务中心" style={{ width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--panel2)', border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer', color: 'var(--text)', position: 'relative' }}>
        <Icon name="bell" size={17} color="currentColor" />
      </button>

      {/* 主题切换 */}
      <button onClick={toggleTheme} style={{ width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--panel2)', border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer', color: 'var(--text)' }}>
        <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={17} color="currentColor" />
      </button>

      {/* 用户菜单 */}
      <div style={{ position: 'relative' }}>
        <button onClick={() => setMenu('user')} style={{ display: 'flex', alignItems: 'center', gap: 9, background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text)', padding: '3px 3px 3px 6px' }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: 'linear-gradient(135deg,#2a3340,#1a212c)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 600, color: 'var(--accent)' }}>{(user?.name || user?.username || '?')[0]}</div>
          <div style={{ textAlign: 'left' }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, lineHeight: 1.1, whiteSpace: 'nowrap' }}>{user?.name || user?.username}</div>
            <div style={{ fontSize: 10.5, color: 'var(--text3)', whiteSpace: 'nowrap' }}>{user?.role_label}</div>
          </div>
          <Icon name="chevron" size={13} color="var(--text3)" sw={2} />
        </button>
        {openMenu === 'user' && (
          <div style={{ position: 'absolute', top: 48, right: 0, width: 248, background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 12, boxShadow: 'var(--shadow)', padding: 7, animation: 'popin .12s ease', zIndex: 50 }}>
            <div style={{ padding: '10px 10px 12px', borderBottom: '1px solid var(--border-soft)', marginBottom: 6 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{user?.name || user?.username}</div>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{user?.role_label} · {curProject?.name}</div>
            </div>
            {user?.role === 'admin' && (
              <button onClick={() => goView('admin')} style={menuItemStyle}><Icon name="users" size={15} color="currentColor" sw={1.6} />用户管理</button>
            )}
            <button onClick={() => goView('settings')} style={menuItemStyle}><Icon name="settings" size={15} color="currentColor" sw={1.6} />设置</button>
            <div style={{ height: 1, background: 'var(--border-soft)', margin: '6px 4px' }} />
            <button onClick={doLogout} style={{ ...menuItemStyle, color: 'var(--red)' }}><Icon name="logout" size={15} color="currentColor" sw={1.6} />退出登录</button>
          </div>
        )}
      </div>
    </div>
  )
}

const menuItemStyle = {
  width: '100%', display: 'flex', alignItems: 'center', gap: 10,
  background: 'transparent', border: 'none', borderRadius: 8, padding: '9px 10px',
  cursor: 'pointer', color: 'var(--text)', fontSize: 13,
} as const
