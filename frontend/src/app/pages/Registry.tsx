/** 模型管理 / 引擎 + 显存看板（真实状态 + load/unload）。 */
import { useEffect, useState } from 'react'
import { getRegistry, loadModel2, unloadModel2, type RegistryResp } from '../../api2'
import { useApp } from '../../appStore'
import { Card, Icon, Page, PageHead } from '../ui'
import { toast } from '../overlays'

const PALETTE = ['var(--accent)', 'var(--blue)', 'var(--amber)', 'var(--green)', '#a78bfa', 'var(--red)']
type Filter = 'all' | 'loaded' | 'local' | 'remote'

function Stars({ n, color }: { n: number; color: string }) {
  return <span style={{ display: 'inline-flex', gap: 1 }}>{[0, 1, 2, 3, 4].map((i) => <span key={i} style={{ width: 5, height: 5, borderRadius: '50%', background: i < n ? color : 'var(--border)' }} />)}</span>
}

export default function Registry() {
  const isAdmin = useApp((s) => s.user?.role === 'admin')
  const [data, setData] = useState<RegistryResp | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const [busy, setBusy] = useState<string | null>(null)
  const refresh = () => getRegistry().then(setData).catch(() => undefined)
  useEffect(() => { refresh(); const t = setInterval(refresh, 5000); return () => clearInterval(t) }, [])

  const act = async (name: string, load: boolean) => {
    setBusy(name)
    try { await (load ? loadModel2(name) : unloadModel2(name)); await refresh() }
    catch (e) { toast((e as Error).message) } finally { setBusy(null) }
  }

  if (!data) return <Page><PageHead title="模型管理 / 引擎" sub="加载中…" /></Page>
  const used = data.gpu_used_gb ?? data.models.filter((m) => m.status === 'loaded').reduce((s, m) => s + m.vram, 0)
  const total = data.gpu_total_gb
  const free = Math.max(0, total - used)
  const loadedItems = data.models.filter((m) => m.status === 'loaded')
  const counts = {
    all: data.models.length,
    loaded: loadedItems.length,
    local: data.models.filter((m) => m.downloaded).length,
    remote: data.models.filter((m) => !m.downloaded).length,
  }
  const pass = (m: RegistryResp['models'][0]) => filter === 'all' || (filter === 'loaded' ? m.status === 'loaded' : filter === 'local' ? m.downloaded : !m.downloaded)
  const groups = Array.from(new Set(data.models.map((m) => m.group)))

  return (
    <Page>
      <PageHead title="模型管理 / 引擎" sub="检测 / VQA / 分割 · 加载 / 卸载 · 显存看板" />
      {/* VRAM 看板 */}
      <Card style={{ marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>显存看板</div>
            <div style={{ fontSize: 11.5, color: 'var(--text3)', marginTop: 3 }}>单卡 · {total} GB · 当前 {loadedItems.length} 个模型常驻</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <span style={{ fontSize: 22, fontWeight: 700, fontFamily: 'var(--mono)', color: used > total * 0.85 ? 'var(--red)' : 'var(--text)' }}>{used.toFixed(1)}</span>
            <span style={{ fontSize: 13, color: 'var(--text3)', fontFamily: 'var(--mono)' }}> / {total} GB</span>
          </div>
        </div>
        <div style={{ display: 'flex', height: 30, borderRadius: 8, overflow: 'hidden', background: 'var(--panel2)', marginBottom: 12 }}>
          {loadedItems.map((m, i) => <div key={m.name} style={{ width: `${(m.vram / total) * 100}%`, background: PALETTE[i % PALETTE.length], display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 600, color: '#04140f', borderRight: '1px solid var(--bg)' }}>{m.vram}G</div>)}
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10.5, color: 'var(--text3)' }}>{free > 0 ? `空闲 ${free.toFixed(1)} GB` : '显存已满'}</div>
        </div>
        <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
          {loadedItems.map((m, i) => <span key={m.name} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11.5, color: 'var(--text2)' }}><span style={{ width: 9, height: 9, borderRadius: 3, background: PALETTE[i % PALETTE.length] }} />{m.name}</span>)}
          <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11.5, color: 'var(--amber)', marginLeft: 'auto' }}><Icon name="warn" size={13} color="var(--amber)" />大模型互斥，不能同时常驻</span>
        </div>
      </Card>
      {/* 筛选 */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {([['all', `全部 ${counts.all}`], ['loaded', `已加载 ${counts.loaded}`], ['local', `本地 ${counts.local}`], ['remote', `在线 ${counts.remote}`]] as [Filter, string][]).map(([k, l]) => (
          <button key={k} onClick={() => setFilter(k)} style={{ fontSize: 12.5, padding: '7px 13px', borderRadius: 8, border: `1px solid ${filter === k ? 'var(--accent)' : 'var(--border)'}`, background: filter === k ? 'var(--accent-ghost)' : 'transparent', color: filter === k ? 'var(--accent)' : 'var(--text2)', cursor: 'pointer', fontWeight: filter === k ? 600 : 500 }}>{l}</button>
        ))}
      </div>
      {/* 分组表 */}
      {groups.map((g) => {
        const items = data.models.filter((m) => m.group === g && pass(m))
        if (!items.length) return null
        return (
          <div key={g} style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginBottom: 10 }}>{g}</div>
            <Card style={{ padding: 15 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1.9fr .7fr 1fr .6fr .7fr 1fr 1.4fr', padding: '0 4px 11px', fontSize: 11, color: 'var(--text3)', borderBottom: '1px solid var(--border-soft)' }}>
                {['模型', '来源', '精度/速度', '语言', '显存', '状态', '操作'].map((h) => <span key={h}>{h}</span>)}
              </div>
              {items.map((m, i) => (
                <div key={m.name} style={{ display: 'grid', gridTemplateColumns: '1.9fr .7fr 1fr .6fr .7fr 1fr 1.4fr', alignItems: 'center', padding: '12px 4px', borderBottom: i < items.length - 1 ? '1px solid var(--border-soft)' : 'none' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13, fontWeight: 600, fontFamily: 'var(--mono)' }}>{m.name}</span>
                    {m.mutex && <span style={{ fontSize: 9.5, color: 'var(--amber)', background: 'var(--amber-g)', borderRadius: 4, padding: '1px 5px' }}>互斥</span>}
                  </div>
                  <span style={{ fontSize: 12, color: m.src === '自训练' ? 'var(--accent)' : 'var(--text2)' }}>{m.src}</span>
                  <span style={{ display: 'flex', gap: 8 }}><Stars n={m.acc} color="var(--green)" /><Stars n={m.speed} color="var(--blue)" /></span>
                  <span style={{ fontSize: 12, color: 'var(--text2)' }}>{m.lang}</span>
                  <span style={{ fontSize: 12, fontFamily: 'var(--mono)', color: 'var(--text2)' }}>{m.vram}G</span>
                  <span style={{ fontSize: 11.5, color: m.status === 'loaded' ? 'var(--green)' : m.status === 'remote' ? 'var(--text3)' : 'var(--text2)' }}>
                    {m.status === 'loaded' ? '已加载' : m.status === 'downloaded' ? '本地·未加载' : '在线·需下载'}
                  </span>
                  <div style={{ display: 'flex', gap: 7 }}>
                    {isAdmin && m.status === 'downloaded' && <button onClick={() => act(m.name, true)} disabled={busy === m.name} style={ab('var(--accent)', 'var(--accent-ghost)')}>{busy === m.name ? '…' : '加载'}</button>}
                    {isAdmin && m.status === 'loaded' && <button onClick={() => act(m.name, false)} disabled={busy === m.name} style={ab('var(--amber)', 'var(--amber-g)')}>{busy === m.name ? '…' : '卸载'}</button>}
                    {m.status === 'remote' && <span style={{ fontSize: 11, color: 'var(--text3)' }}>需在服务器预取权重</span>}
                    {!isAdmin && m.status !== 'remote' && <span style={{ fontSize: 11, color: 'var(--text3)' }}>{m.status === 'loaded' ? '常驻' : '本地'}</span>}
                  </div>
                </div>
              ))}
            </Card>
          </div>
        )
      })}
    </Page>
  )
}

const ab = (color: string, bg: string) => ({ fontSize: 11.5, color, background: bg, border: 'none', borderRadius: 6, padding: '5px 11px', cursor: 'pointer', whiteSpace: 'nowrap' }) as const
