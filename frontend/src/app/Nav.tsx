/** 左侧导航：5 个分组，系统组仅管理员可见（移植设计稿 navConfig/buildNav）。 */
import { useApp } from '../appStore'
import type { Capability, ViewKey } from '../types'
import { Icon } from './ui'

interface NavItem {
  id: string
  label: string
  icon: string
  cap?: boolean
}
interface NavGroup {
  title: string
  admin?: boolean
  items: NavItem[]
}

export const NAV_CONFIG: NavGroup[] = [
  {
    title: '工作台',
    items: [
      { id: 'detect', label: '目标检测 / 智能识别', cap: true, icon: 'detect' },
      { id: 'vqa', label: '状态巡检 / 视觉问答', cap: true, icon: 'vqa' },
      { id: 'ocr', label: '文字提取 OCR', cap: true, icon: 'ocr' },
      { id: 'matting', label: '抠图 / 分割', cap: true, icon: 'matting' },
      { id: 'element', label: '图片元素拆解', cap: true, icon: 'element' },
    ],
  },
  {
    title: '数据',
    items: [
      { id: 'projects', label: '项目与数据集', icon: 'proj' },
      { id: 'annotation', label: '数据标注', icon: 'anno' },
    ],
  },
  {
    title: '训练',
    items: [
      { id: 'training', label: '模型训练', icon: 'train' },
      { id: 'registry', label: '模型管理 / 引擎', icon: 'reg' },
    ],
  },
  {
    title: '运行',
    items: [
      { id: 'jobs', label: '任务中心', icon: 'jobs' },
      { id: 'batch', label: '批量处理', icon: 'batch' },
    ],
  },
  {
    title: '系统',
    admin: true,
    items: [
      { id: 'admin', label: '用户管理', icon: 'users' },
      { id: 'monitor', label: '资源监控', icon: 'monitor' },
      { id: 'settings', label: '设置', icon: 'settings' },
    ],
  },
]

export default function Nav() {
  const view = useApp((s) => s.view)
  const capability = useApp((s) => s.capability)
  const role = useApp((s) => s.user?.role ?? 'guest')
  const openCapability = useApp((s) => s.openCapability)
  const goView = useApp((s) => s.goView)

  const groups = NAV_CONFIG.filter((g) => !(g.admin && role !== 'admin'))
  const isActive = (it: NavItem) =>
    it.cap ? view === 'workbench' && capability === it.id : view === it.id

  return (
    <>
      {groups.map((g, gi) => (
        <div key={gi} style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 11px 8px' }}>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--accent)', fontWeight: 600 }}>{String(gi + 1).padStart(2, '0')}</span>
            <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '1.6px', color: 'var(--text3)', textTransform: 'uppercase' }}>{g.title}</span>
            <span style={{ flex: 1, height: 1, background: 'var(--border-soft)' }} />
          </div>
          {g.items.map((it) => {
            const act = isActive(it)
            return (
              <button
                key={it.id}
                onClick={() => (it.cap ? openCapability(it.id as Capability) : goView(it.id as ViewKey))}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 11,
                  background: act ? 'var(--accent-ghost)' : 'transparent',
                  border: 'none', borderRadius: 8, padding: '9px 11px', cursor: 'pointer',
                  color: act ? 'var(--accent)' : 'var(--text2)', fontSize: 13, fontWeight: act ? 600 : 500,
                  boxShadow: act ? 'inset 0 0 0 1px rgba(25,200,184,.18)' : 'none',
                  position: 'relative', textAlign: 'left', marginBottom: 1,
                }}
                onMouseEnter={(e) => {
                  if (!act) {
                    e.currentTarget.style.background = 'var(--panel2)'
                    e.currentTarget.style.color = 'var(--text)'
                  }
                }}
                onMouseLeave={(e) => {
                  if (!act) {
                    e.currentTarget.style.background = 'transparent'
                    e.currentTarget.style.color = 'var(--text2)'
                  }
                }}
              >
                {act && <span style={{ position: 'absolute', left: 0, top: 7, bottom: 7, width: 3, borderRadius: '0 3px 3px 0', background: 'var(--accent)', boxShadow: '0 0 10px var(--accent)' }} />}
                <Icon name={it.icon} size={17} />
                <span style={{ flex: 1 }}>{it.label}</span>
              </button>
            )
          })}
        </div>
      ))}
    </>
  )
}
