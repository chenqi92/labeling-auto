/** 任务中心：批量推理 / 训练 / 导出 的统一列表 + 详情抽屉 + 停止。 */
import { useEffect, useState } from 'react'
import { getJob, listJobs, stopJob, type JobDetail, type JobOut } from '../../api2'
import { Btn, Card, Icon, Page, PageHead, ProgressBar, StatusPill } from '../ui'

const TYPE_LABEL: Record<string, string> = { batch: '批量推理', training: '训练' }
const FILTERS: [string, string][] = [['all', '全部'], ['running', '运行中'], ['queued', '排队'], ['success', '成功'], ['failed', '失败']]

export default function Jobs() {
  const [jobs, setJobs] = useState<JobOut[]>([])
  const [filter, setFilter] = useState('all')
  const [detail, setDetail] = useState<JobDetail | null>(null)
  const refresh = () => listJobs().then(setJobs).catch(() => undefined)
  useEffect(() => { refresh(); const t = setInterval(refresh, 2500); return () => clearInterval(t) }, [])
  useEffect(() => {
    if (!detail) return
    let cancelled = false
    const t = setInterval(() => getJob(detail.id).then((d) => { if (!cancelled) setDetail(d) }).catch(() => undefined), 2000)
    return () => { cancelled = true; clearInterval(t) }
  }, [detail?.id])

  const shown = jobs.filter((j) => filter === 'all' || j.status === filter)
  const cols = '1.1fr 1fr 1.4fr 1.5fr 1fr .9fr'

  return (
    <Page>
      <PageHead title="任务中心" sub="批量推理 / 训练 / 导出 异步任务统一管理" actions={<Btn label="刷新" icon="refresh" onClick={refresh} />} />
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {FILTERS.map(([k, l]) => (
          <button key={k} onClick={() => setFilter(k)} style={{ fontSize: 12.5, padding: '7px 14px', borderRadius: 8, border: `1px solid ${filter === k ? 'var(--accent)' : 'var(--border)'}`, background: filter === k ? 'var(--accent-ghost)' : 'transparent', color: filter === k ? 'var(--accent)' : 'var(--text2)', cursor: 'pointer', fontWeight: filter === k ? 600 : 500 }}>{l}</button>
        ))}
      </div>
      <Card style={{ padding: 18 }}>
        <div style={{ display: 'grid', gridTemplateColumns: cols, padding: '0 6px 12px', fontSize: 11, color: 'var(--text3)', borderBottom: '1px solid var(--border-soft)' }}>
          {['类型', '能力', '所属项目', '进度', '发起 / 时间', '操作'].map((h) => <span key={h}>{h}</span>)}
        </div>
        {shown.length === 0 && <div style={{ padding: 20, fontSize: 13, color: 'var(--text3)' }}>暂无任务。去「批量处理」或「模型训练」发起一个。</div>}
        {shown.map((r) => (
          <div key={r.id} style={{ display: 'grid', gridTemplateColumns: cols, alignItems: 'center', padding: '13px 6px', borderBottom: '1px solid var(--border-soft)' }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>{TYPE_LABEL[r.type] ?? r.type}</span>
            <span style={{ fontSize: 12.5, color: 'var(--text2)' }}>{r.capability || '—'}</span>
            <span style={{ fontSize: 12.5, color: 'var(--text2)' }}>{r.project_name || '—'}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <ProgressBar pct={r.progress} color={r.status === 'failed' ? 'var(--red)' : r.status === 'success' ? 'var(--green)' : 'var(--accent)'} />
              <span style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text3)', width: 38 }}>{Math.round(r.progress)}%</span>
            </div>
            <div>
              <StatusPill status={r.status} />
              <div style={{ fontSize: 10.5, color: 'var(--text3)', marginTop: 4 }}>{r.who} · {new Date(r.created_at * 1000).toLocaleTimeString('zh-CN', { hour12: false })}</div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => getJob(r.id).then(setDetail)} style={linkBtn('var(--accent)')}>详情</button>
              {(r.status === 'running' || r.status === 'queued') && <button onClick={async () => { await stopJob(r.id); refresh() }} style={linkBtn('var(--red)')}>停止</button>}
            </div>
          </div>
        ))}
      </Card>

      {detail && (
        <div onClick={() => setDetail(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 60, display: 'flex', justifyContent: 'flex-end' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: 480, height: '100%', background: 'var(--panel)', borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column', animation: 'fadeup .15s ease' }}>
            <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--border-soft)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 600 }}>{TYPE_LABEL[detail.type] ?? detail.type} · {detail.project_name}</div>
                <div style={{ fontSize: 11.5, color: 'var(--text3)', marginTop: 3 }}>{detail.metric || detail.detail} · {detail.done}/{detail.total}</div>
              </div>
              <button onClick={() => setDetail(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)' }}><Icon name="close" size={18} color="currentColor" /></button>
            </div>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border-soft)', display: 'flex', alignItems: 'center', gap: 12 }}>
              <StatusPill status={detail.status} />
              <ProgressBar pct={detail.progress} />
              <span style={{ fontSize: 12, fontFamily: 'var(--mono)', color: 'var(--text2)' }}>{Math.round(detail.progress)}%</span>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: 18, background: 'var(--canvas)', fontFamily: 'var(--mono)', fontSize: 11.5, lineHeight: 1.7, color: 'var(--text2)' }}>
              {detail.logs.length === 0 ? <span style={{ color: 'var(--text3)' }}>暂无日志</span> : detail.logs.map((l, i) => <div key={i} style={{ color: l.includes('失败') ? 'var(--red)' : l.includes('完成') || l.includes('上架') ? 'var(--green)' : 'var(--text2)' }}>{l}</div>)}
            </div>
          </div>
        </div>
      )}
    </Page>
  )
}

const linkBtn = (color: string) => ({ fontSize: 12, color, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }) as const
