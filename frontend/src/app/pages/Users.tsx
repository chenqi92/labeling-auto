/** 用户管理（管理员）—— 真实 CRUD：列表 / 新增 / 改角色 / 重置密码 / 删除。 */
import { useEffect, useState } from 'react'
import { createUser, deleteUser, listUsers, updateUser } from '../../authApi'
import { useApp } from '../../appStore'
import type { Role, User } from '../../types'
import { Btn, Card, Page, PageHead } from '../ui'
import { confirmDialog, promptDialog, toast } from '../overlays'

const ROLE_OPTS: { value: Role; label: string }[] = [
  { value: 'admin', label: '管理员' },
  { value: 'user', label: '标注员' },
  { value: 'guest', label: '只读访客' },
]

export default function Users() {
  const me = useApp((s) => s.user)
  const [users, setUsers] = useState<User[]>([])
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [nu, setNu] = useState({ username: '', name: '', password: '', role: 'user' as Role })

  const refresh = () => {
    setLoading(true)
    listUsers()
      .then(setUsers)
      .catch((e) => setErr((e as Error).message))
      .finally(() => setLoading(false))
  }
  useEffect(refresh, [])

  const onCreate = async () => {
    if (!nu.username.trim() || !nu.password) {
      setErr('账号和密码必填')
      return
    }
    try {
      await createUser({ username: nu.username.trim(), name: nu.name.trim(), password: nu.password, role: nu.role })
      setShowNew(false)
      setNu({ username: '', name: '', password: '', role: 'user' })
      setErr('')
      refresh()
    } catch (e) {
      setErr((e as Error).message)
    }
  }

  const onRole = async (u: User, role: Role) => {
    try {
      await updateUser(u.id, { role })
      refresh()
    } catch (e) {
      setErr((e as Error).message)
    }
  }

  const onReset = async (u: User) => {
    const pw = await promptDialog(`为「${u.name || u.username}」设置新密码：`)
    if (!pw) return
    try {
      await updateUser(u.id, { password: pw })
      setErr('')
      toast('密码已重置', 'success')
    } catch (e) {
      setErr((e as Error).message)
    }
  }

  const onDelete = async (u: User) => {
    if (!(await confirmDialog(`删除用户「${u.name || u.username}」？`))) return
    try {
      await deleteUser(u.id)
      refresh()
    } catch (e) {
      setErr((e as Error).message)
    }
  }

  const cols = '1.4fr 1fr 1fr .8fr 1fr 1.2fr'

  return (
    <Page>
      <PageHead title="用户管理" sub="增删用户 · 改角色 · 重置密码" actions={<Btn label="新增用户" primary icon="plus" onClick={() => setShowNew((v) => !v)} />} />

      {err && <div style={{ marginBottom: 14, fontSize: 12.5, color: 'var(--red)', background: 'var(--red-g)', border: '1px solid rgba(255,90,95,.3)', borderRadius: 8, padding: '9px 12px' }}>{err}</div>}

      {showNew && (
        <Card style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>新增用户</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr .8fr auto', gap: 10, alignItems: 'center' }}>
            <input placeholder="账号" value={nu.username} onChange={(e) => setNu({ ...nu, username: e.target.value })} style={inp} />
            <input placeholder="显示名" value={nu.name} onChange={(e) => setNu({ ...nu, name: e.target.value })} style={inp} />
            <input placeholder="初始密码" value={nu.password} onChange={(e) => setNu({ ...nu, password: e.target.value })} style={inp} />
            <select value={nu.role} onChange={(e) => setNu({ ...nu, role: e.target.value as Role })} style={inp}>
              {ROLE_OPTS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
            <Btn label="创建" primary onClick={onCreate} />
          </div>
        </Card>
      )}

      <Card style={{ padding: 18 }}>
        <div style={{ display: 'grid', gridTemplateColumns: cols, padding: '0 6px 12px', fontSize: 11, color: 'var(--text3)', borderBottom: '1px solid var(--border-soft)' }}>
          {['用户', '账号', '角色', '状态', '最近活跃', '操作'].map((h) => <span key={h}>{h}</span>)}
        </div>
        {loading && <div style={{ padding: 20, fontSize: 13, color: 'var(--text3)' }}>加载中…</div>}
        {!loading && users.map((u) => (
          <div key={u.id} style={{ display: 'grid', gridTemplateColumns: cols, alignItems: 'center', padding: '13px 6px', borderBottom: '1px solid var(--border-soft)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 30, height: 30, borderRadius: 8, background: 'var(--panel2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600, color: 'var(--accent)' }}>{(u.name || u.username)[0]}</div>
              <span style={{ fontSize: 13, fontWeight: 500 }}>{u.name || u.username}{u.id === me?.id && <span style={{ fontSize: 10, color: 'var(--text3)', marginLeft: 6 }}>(我)</span>}</span>
            </div>
            <span style={{ fontSize: 12.5, fontFamily: 'var(--mono)', color: 'var(--text2)' }}>{u.username}</span>
            <select value={u.role} onChange={(e) => onRole(u, e.target.value as Role)} style={{ ...inp, padding: '5px 8px', fontSize: 12.5, width: 110 }}>
              {ROLE_OPTS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: u.online ? 'var(--green)' : 'var(--text3)' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: u.online ? 'var(--green)' : 'var(--text3)' }} />{u.online ? '在线' : '离线'}
            </span>
            <span style={{ fontSize: 12, color: 'var(--text3)' }}>{u.last_active ? new Date(u.last_active * 1000).toLocaleString('zh-CN', { hour12: false }) : '—'}</span>
            <div style={{ display: 'flex', gap: 12 }}>
              <button onClick={() => onReset(u)} style={linkBtn}>重置密码</button>
              {u.id !== me?.id && <button onClick={() => onDelete(u)} style={{ ...linkBtn, color: 'var(--red)' }}>删除</button>}
            </div>
          </div>
        ))}
      </Card>
    </Page>
  )
}

const inp = {
  background: 'var(--panel2)', border: '1px solid var(--border)', borderRadius: 8,
  padding: '9px 11px', color: 'var(--text)', fontSize: 13, outline: 'none',
} as const
const linkBtn = { fontSize: 12, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 } as const
