/** 应用外壳：顶栏 + 左导航 + 内容区。整体套用 data-theme。 */
import { useApp } from '../appStore'
import Content from './Content'
import Nav from './Nav'
import TopBar from './TopBar'

export default function Shell() {
  const theme = useApp((s) => s.theme)
  const openMenu = useApp((s) => s.openMenu)
  const closeMenus = useApp((s) => s.closeMenus)

  return (
    <div data-theme={theme} style={{ height: '100vh', width: '100%', overflow: 'hidden', background: 'var(--bg)', color: 'var(--text)', position: 'relative' }}>
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
        <TopBar />
        <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
          {/* 左导航 */}
          <div style={{ width: 228, flex: '0 0 228px', background: 'var(--chrome)', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', padding: '12px 10px', overflowY: 'auto' }}>
            <Nav />
            <div style={{ flex: 1 }} />
            <div style={{ borderTop: '1px solid var(--border-soft)', paddingTop: 11, marginTop: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '7px 10px', fontSize: 11, color: 'var(--text3)' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--green)' }} />内网 · 在线 · v2.4.1 上传修复
              </div>
            </div>
          </div>
          {/* 内容区 */}
          <div style={{ flex: 1, minWidth: 0, background: 'var(--bg)', backgroundImage: 'var(--dotgrid)', backgroundSize: '24px 24px', overflow: 'hidden', position: 'relative' }}>
            <Content />
          </div>
        </div>
      </div>

      {/* 点击空白关闭顶栏弹层 */}
      {openMenu && <div onClick={closeMenus} style={{ position: 'fixed', inset: 0, zIndex: 35 }} />}
    </div>
  )
}
