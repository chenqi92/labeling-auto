/** 外壳通用 UI 原子：内联 SVG 图标、状态药丸、进度条等。沿用设计稿的 CSS 变量风格。 */
import type { CSSProperties, ReactNode } from 'react'

/** 用 path 字符串渲染 24x24 描边图标（移植设计稿的 ico()）。 */
export function Svg({
  path,
  size = 16,
  sw = 1.7,
  color = 'currentColor',
  fill = 'none',
  style,
}: {
  path: string
  size?: number
  sw?: number
  color?: string
  fill?: string
  style?: CSSProperties
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill}
      stroke={color}
      strokeWidth={sw}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ display: 'block', flex: '0 0 auto', ...style }}
      dangerouslySetInnerHTML={{ __html: path }}
    />
  )
}

/** 导航 / 能力图标路径表（移植自设计稿 iconPath）。 */
export const ICONS: Record<string, string> = {
  logo: '<path d="M3 8l9-5 9 5-9 5-9-5z"/><path d="M3 12l9 5 9-5M3 16l9 5 9-5"/>',
  detect:
    '<rect x="3" y="3" width="7" height="7" rx="1.3"/><rect x="14" y="14" width="7" height="7" rx="1.3"/><path d="M14 5h5v5M5 14v5h5"/>',
  vqa: '<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21l4-4 4 4"/><path d="M9 9.5a3 3 0 113.5 3v1.5"/>',
  ocr: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 8h10M7 12h10M7 16h6"/>',
  matting:
    '<path d="M3 3h6M3 3v6M21 3h-6M21 3v6M3 21h6M3 21v-6M21 21h-6M21 21v-6"/><circle cx="12" cy="12" r="3.5"/>',
  element:
    '<rect x="3" y="3" width="8" height="8" rx="1.3"/><rect x="13" y="3" width="8" height="5" rx="1.3"/><rect x="13" y="11" width="8" height="10" rx="1.3"/><rect x="3" y="14" width="8" height="7" rx="1.3"/>',
  proj: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18"/>',
  anno: '<path d="M4 16l9-9 4 4-9 9H4v-4z"/><path d="M14 5l2-2 4 4-2 2"/>',
  train: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4"/><circle cx="12" cy="12" r="4"/>',
  reg: '<rect x="3" y="3" width="18" height="6" rx="1.5"/><rect x="3" y="11" width="18" height="6" rx="1.5"/><path d="M7 6h.01M7 14h.01"/>',
  jobs: '<path d="M5 6h14M5 12h14M5 18h14"/>',
  batch:
    '<rect x="4" y="4" width="7" height="7" rx="1.3"/><rect x="13" y="4" width="7" height="7" rx="1.3"/><rect x="4" y="13" width="7" height="7" rx="1.3"/><rect x="13" y="13" width="7" height="7" rx="1.3"/>',
  users: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3 2.7-5 6-5s6 2 6 5"/><path d="M16 5.5a3 3 0 010 5.5M18 20c0-2.4-1-3.7-2.5-4.5"/>',
  monitor: '<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/><path d="M7 12l3-3 2 2 4-4"/>',
  settings:
    '<circle cx="12" cy="12" r="3.2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/>',
  chevron: '<path d="M6 9l6 6 6-6"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  bell: '<path d="M6 9a6 6 0 0112 0c0 5 2 6 2 6H4s2-1 2-6z"/><path d="M10 19a2 2 0 004 0"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19"/>',
  moon: '<path d="M20 14.5A8 8 0 119.5 4 6.5 6.5 0 0020 14.5z"/>',
  user: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20c0-3.5 3-5.5 7-5.5s7 2 7 5.5"/>',
  lock: '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 018 0v3"/>',
  logout: '<path d="M14 8V5a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2h7a2 2 0 002-2v-3M9 12h12m0 0l-3-3m3 3l-3 3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  refresh: '<path d="M4 12a8 8 0 018-8 8 8 0 016 2.7M20 12a8 8 0 01-8 8 8 8 0 01-6-2.7M18 4v3h-3M6 20v-3h3"/>',
  warn: '<circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16v.5"/>',
  back: '<path d="M15 18l-6-6 6-6"/>',
  download: '<path d="M12 3v12m0 0l-4-4m4 4l4-4M5 21h14"/>',
  check: '<path d="M5 12l5 5L20 7"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  trash: '<path d="M4 7h16M9 7V5a2 2 0 012-2h2a2 2 0 012 2v2M6 7l1 13a2 2 0 002 2h6a2 2 0 002-2l1-13"/>',
  upload: '<path d="M12 16V4m0 0l-4 4m4-4l4 4M5 20h14"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="2.5"/>',
  copy: '<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M5 16V5a2 2 0 012-2h9"/>',
  play: '<path d="M7 5l11 7-11 7V5z"/>',
}

export function Icon({ name, size, sw, color, style }: { name: string; size?: number; sw?: number; color?: string; style?: CSSProperties }) {
  return <Svg path={ICONS[name] ?? ICONS.detect} size={size} sw={sw} color={color} style={style} />
}

const PILL: Record<string, [string, string, string]> = {
  queued: ['排队中', 'var(--text2)', 'var(--panel2)'],
  running: ['运行中', 'var(--blue)', 'var(--blue-g)'],
  success: ['成功', 'var(--green)', 'var(--green-g)'],
  done: ['已完成', 'var(--green)', 'var(--green-g)'],
  failed: ['失败', 'var(--red)', 'var(--red-g)'],
  paused: ['已暂停', 'var(--amber)', 'var(--amber-g)'],
}

export function StatusPill({ status, label }: { status: string; label?: string }) {
  const [t, c, g] = PILL[status] ?? PILL.queued
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 600, color: c, background: g, borderRadius: 6, padding: '3px 9px', whiteSpace: 'nowrap' }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: c, animation: status === 'running' ? 'pulse 1.4s infinite' : 'none' }} />
      {label ?? t}
    </span>
  )
}

export function ProgressBar({ pct, color = 'var(--accent)' }: { pct: number; color?: string }) {
  return (
    <div style={{ height: 6, background: 'var(--panel2)', borderRadius: 4, overflow: 'hidden', flex: 1 }}>
      <div style={{ height: '100%', width: `${Math.max(0, Math.min(100, pct))}%`, background: color, borderRadius: 4, transition: 'width .4s' }} />
    </div>
  )
}

/** 页面标题区（移植设计稿 pageHead）。 */
export function PageHead({ title, sub, actions }: { title: ReactNode; sub?: string; actions?: ReactNode }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
            <span style={{ width: 4, height: 22, background: 'var(--accent)', borderRadius: 1, boxShadow: '0 0 12px var(--accent)' }} />
            <h1 style={{ fontFamily: 'var(--display)', fontSize: 23, fontWeight: 700, letterSpacing: '-.4px', margin: 0 }}>{title}</h1>
          </div>
          {sub && <div style={{ fontFamily: 'var(--mono)', fontSize: 11.5, color: 'var(--text3)', marginTop: 8, marginLeft: 15, letterSpacing: '.2px' }}>{'// ' + sub}</div>}
        </div>
        {actions && <div style={{ display: 'flex', gap: 10 }}>{actions}</div>}
      </div>
      <div style={{ marginTop: 16, height: 7, borderTop: '1px solid var(--border)', backgroundImage: 'repeating-linear-gradient(90deg, var(--border) 0, var(--border) 1px, transparent 1px, transparent 46px)', backgroundSize: '46px 5px', backgroundRepeat: 'repeat-x', opacity: 0.65 }} />
    </div>
  )
}

/** 卡片容器。 */
export function Card({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 12, padding: 18, ...style }}>{children}</div>
}

/** 通用按钮（primary = 强调色填充）。 */
export function Btn({ label, icon, primary, onClick, disabled, style }: { label: ReactNode; icon?: string; primary?: boolean; onClick?: () => void; disabled?: boolean; style?: CSSProperties }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        background: primary ? 'var(--accent)' : 'var(--panel2)',
        color: primary ? '#04140f' : 'var(--text)',
        border: primary ? 'none' : '1px solid var(--border)',
        borderRadius: 8, padding: '9px 15px', fontSize: 13, fontWeight: 600,
        cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1,
        ...style,
      }}
    >
      {icon && <Icon name={icon} size={15} sw={1.8} />}
      {label}
    </button>
  )
}

/** 占位页面（功能即将上线）。 */
export function StubPage({ title, desc }: { title: string; desc: string }) {
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, color: 'var(--text3)' }}>
      <div style={{ width: 54, height: 54, borderRadius: 14, background: 'var(--panel2)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Svg path='<rect x="4" y="4" width="16" height="16" rx="3"/>' size={26} sw={1.6} color="var(--accent)" />
      </div>
      <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--text)' }}>{title}</div>
      <div style={{ fontSize: 13 }}>{desc}</div>
      <div style={{ fontSize: 12, marginTop: 4 }}>该模块即将上线 · 已接入统一工作台骨架</div>
    </div>
  )
}

/** 无权限占位。 */
export function NoPerm() {
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, color: 'var(--text3)' }}>
      <Icon name="lock" size={40} sw={1.4} color="var(--text3)" />
      <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>无权限访问</div>
      <div style={{ fontSize: 13 }}>该功能仅管理员可用，请使用管理员账号登录查看</div>
    </div>
  )
}

/** 可滚动页面容器。 */
export function Page({ children, pad = '26px 32px 60px' }: { children: ReactNode; pad?: string }) {
  return (
    <div style={{ height: '100%', overflowY: 'auto' }}>
      <div style={{ padding: pad }}>{children}</div>
    </div>
  )
}
