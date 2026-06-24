/** 登录页（移植设计稿 LOGIN 区）。账号密码走真实后端 /api/auth/login。 */
import { useState } from 'react'
import { login as apiLogin } from '../authApi'
import { useApp } from '../appStore'
import { Svg } from './ui'

export default function Login() {
  const setSession = useApp((s) => s.setSession)
  const [user, setUser] = useState('')
  const [pwd, setPwd] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const doLogin = async () => {
    if (!user.trim() || !pwd) {
      setErr('请输入账号和密码')
      return
    }
    setBusy(true)
    setErr('')
    try {
      const res = await apiLogin(user.trim(), pwd)
      setSession(res.token, res.user)
    } catch (e) {
      setErr((e as Error).message || '登录失败')
    } finally {
      setBusy(false)
    }
  }

  const fill = (u: string, p: string) => {
    setUser(u)
    setPwd(p)
    setErr('')
  }

  return (
    <div data-theme="dark" className="login-shell" style={{ background: 'var(--bg)', color: 'var(--text)' }}>
      {/* 品牌侧（窄屏隐藏） */}
      <div className="login-brand" style={{ position: 'relative', background: 'radial-gradient(120% 90% at 20% 10%,#0f2a2e 0%,#0a0f16 55%,#070a10 100%)', overflow: 'hidden', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '54px 60px' }}>
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(120,200,210,.05) 1px,transparent 1px),linear-gradient(90deg,rgba(120,200,210,.05) 1px,transparent 1px)', backgroundSize: '44px 44px', pointerEvents: 'none' }} />
        <span style={{ position: 'absolute', top: 30, left: 30, width: 26, height: 26, borderTop: '2px solid rgba(25,200,184,.55)', borderLeft: '2px solid rgba(25,200,184,.55)' }} />
        <span style={{ position: 'absolute', bottom: 30, right: 30, width: 26, height: 26, borderBottom: '2px solid rgba(25,200,184,.55)', borderRight: '2px solid rgba(25,200,184,.55)' }} />
        <span style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 1, background: 'linear-gradient(90deg,transparent,rgba(25,200,184,.5),transparent)', animation: 'scan 7s linear infinite' }} />
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 13 }}>
          <div style={{ width: 38, height: 38, borderRadius: 9, background: 'linear-gradient(135deg,#19c8b8,#0f8a80)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 16px rgba(25,200,184,.4)' }}>
            <Svg path='<path d="M3 8l9-5 9 5-9 5-9-5z"/><path d="M3 12l9 5 9-5M3 16l9 5 9-5"/>' size={22} sw={1.7} color="#04140f" />
          </div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '.5px' }}>VisLab</div>
            <div style={{ fontSize: 11, color: 'var(--text3)', letterSpacing: '3px', marginTop: -1 }}>视觉智能工作台</div>
          </div>
        </div>
        <div style={{ maxWidth: 460, position: 'relative', zIndex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
            <span style={{ width: 24, height: 1, background: 'var(--accent)' }} />
            <div style={{ fontFamily: 'var(--mono)', fontSize: 11.5, color: 'var(--accent)', fontWeight: 600, letterSpacing: '3px' }}>VISUAL · INTELLIGENCE · WORKBENCH</div>
          </div>
          <h1 style={{ fontFamily: 'var(--display)', fontSize: 43, lineHeight: 1.15, fontWeight: 700, margin: '0 0 18px', letterSpacing: '-1px' }}>
            把图片丢进来，<br />从识别到训练，<span style={{ color: 'var(--accent)' }}>一站闭环</span>。
          </h1>
          <p style={{ fontSize: 15, lineHeight: 1.7, color: 'var(--text2)', margin: 0 }}>检测识别 · 文字提取 · 状态巡检 · 抠图分割 · 元素拆解，标注好的数据就地训练成专属模型，再回到工作台被调用。</p>
          <div style={{ display: 'flex', gap: 10, marginTop: 30, flexWrap: 'wrap' }}>
            {['能力 × 模型解耦', '项目隔离', '人机协同闭环', '异步任务可见'].map((t) => (
              <span key={t} style={{ fontSize: 12, color: 'var(--text2)', border: '1px solid var(--border)', borderRadius: 20, padding: '6px 13px' }}>{t}</span>
            ))}
          </div>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text3)' }}>© 2026 VisLab · 内网视觉智能平台 · v2.4.1</div>
        <div style={{ position: 'absolute', right: -80, top: '50%', transform: 'translateY(-50%)', width: 360, height: 360, border: '1px solid rgba(25,200,184,.16)', borderRadius: '50%' }} />
        <div style={{ position: 'absolute', right: -30, top: '50%', transform: 'translateY(-50%)', width: 240, height: 240, border: '1px solid rgba(25,200,184,.1)', borderRadius: '50%' }} />
      </div>

      {/* 表单侧 */}
      <div style={{ background: 'var(--chrome)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'clamp(24px,6vw,40px)' }}>
        <div style={{ width: '100%', maxWidth: 340 }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--accent)', letterSpacing: '2.5px', marginBottom: 13 }}>// AUTH · REQUIRED</div>
          <div style={{ fontFamily: 'var(--display)', fontSize: 25, fontWeight: 700, marginBottom: 6, letterSpacing: '-.3px' }}>登录到工作台</div>
          <div style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 26 }}>未登录无法访问任何能力模块</div>

          <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 9 }}>快速以演示账号登录</div>
          <div style={{ display: 'flex', gap: 10, marginBottom: 22 }}>
            <button onClick={() => fill('admin', 'admin123')} style={{ flex: 1, textAlign: 'left', background: 'var(--panel2)', border: '1px solid var(--border)', borderRadius: 9, padding: '11px 12px', cursor: 'pointer', color: 'var(--text)' }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>管理员</div>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2, fontFamily: 'var(--mono)' }}>admin</div>
            </button>
            <button onClick={() => fill('annotator', 'demo1234')} style={{ flex: 1, textAlign: 'left', background: 'var(--panel2)', border: '1px solid var(--border)', borderRadius: 9, padding: '11px 12px', cursor: 'pointer', color: 'var(--text)' }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>标注员</div>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2, fontFamily: 'var(--mono)' }}>annotator</div>
            </button>
          </div>

          <label style={{ fontSize: 12, color: 'var(--text2)', display: 'block', marginBottom: 7 }}>账号 / 工号</label>
          <input value={user} onChange={(e) => setUser(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && doLogin()} placeholder="输入账号" style={inputStyle} />
          <label style={{ fontSize: 12, color: 'var(--text2)', display: 'block', margin: '16px 0 7px' }}>密码</label>
          <input value={pwd} onChange={(e) => setPwd(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && doLogin()} type="password" placeholder="输入密码" style={inputStyle} />

          {err && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 13, color: 'var(--red)', fontSize: 12, background: 'var(--red-g)', border: '1px solid rgba(255,90,95,.3)', borderRadius: 8, padding: '9px 11px' }}>
              <Svg path='<circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 16.5v.5"/>' size={15} color="currentColor" />
              {err}
            </div>
          )}

          <button onClick={doLogin} disabled={busy} style={{ width: '100%', marginTop: 20, background: 'var(--accent)', color: '#04140f', border: 'none', borderRadius: 9, padding: 12, fontSize: 15, fontWeight: 600, cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.6 : 1 }}>
            {busy ? '登录中…' : '登录'}
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '18px 0', color: 'var(--text3)', fontSize: 11 }}>
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />或<div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          </div>
          <button onClick={() => setErr('企业 SSO 暂未接入，请用账号密码登录')} style={{ width: '100%', background: 'transparent', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 9, padding: 11, fontSize: 14, fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9 }}>
            <Svg path='<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 018 0v3"/>' size={16} color="currentColor" />
            企业 / 工号 SSO 登录
          </button>
        </div>
      </div>
    </div>
  )
}

const inputStyle = {
  width: '100%',
  background: 'var(--panel)',
  border: '1px solid var(--border)',
  borderRadius: 9,
  padding: '11px 13px',
  color: 'var(--text)',
  fontSize: 14,
  outline: 'none',
  fontFamily: 'var(--mono)',
} as const
