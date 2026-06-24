/** 模型训练列表：真实训练任务 + 新建入口 + 查看监控。 */
import { useEffect, useState } from 'react'
import { listTraining, type JobOut } from '../../api2'
import { useApp } from '../../appStore'
import { Btn, Card, Page, PageHead, ProgressBar, StatusPill } from '../ui'

export default function Training() {
  const goView = useApp((s) => s.goView)
  const setFocusJob = useApp((s) => s.setFocusJob)
  const [rows, setRows] = useState<JobOut[]>([])
  const refresh = () => listTraining().then(setRows).catch(() => undefined)
  useEffect(() => { refresh(); const t = setInterval(refresh, 3000); return () => clearInterval(t) }, [])

  const open = (id: string) => { setFocusJob(id); goView('trainMonitor') }
  const cols = '1.8fr 1fr 1.4fr 1.3fr 1fr .9fr'

  return (
    <Page>
      <PageHead title="模型训练" sub="基于已标注数据集微调专属模型 · 训练完一键上架回工作台" actions={<Btn label="新建训练任务" primary icon="plus" onClick={() => goView('trainWizard')} />} />
      <Card style={{ padding: 18 }}>
        <div style={{ display: 'grid', gridTemplateColumns: cols, padding: '0 6px 12px', fontSize: 11, color: 'var(--text3)', borderBottom: '1px solid var(--border-soft)' }}>
          {['任务', '类型', '进度', '指标', '状态', '操作'].map((h) => <span key={h}>{h}</span>)}
        </div>
        {rows.length === 0 && <div style={{ padding: 20, fontSize: 13, color: 'var(--text3)' }}>还没有训练任务。先在「项目与数据集」标注并生成数据集，再点「新建训练任务」。</div>}
        {rows.map((r) => (
          <div key={r.id} style={{ display: 'grid', gridTemplateColumns: cols, alignItems: 'center', padding: '13px 6px', borderBottom: '1px solid var(--border-soft)' }}>
            <div>
              <div style={{ fontSize: 13.5, fontWeight: 600, fontFamily: 'var(--mono)' }}>{r.project_name || r.id.slice(0, 6)}</div>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{r.detail || '—'}</div>
            </div>
            <span style={{ fontSize: 12.5, color: 'var(--text2)' }}>{r.capability || '检测'}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <ProgressBar pct={r.progress} color={r.status === 'failed' ? 'var(--red)' : r.status === 'success' ? 'var(--green)' : 'var(--accent)'} />
              <span style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text3)', width: 38 }}>{Math.round(r.progress)}%</span>
            </div>
            <span style={{ fontSize: 12.5, fontFamily: 'var(--mono)', color: 'var(--text)' }}>{r.metric || '—'}</span>
            <StatusPill status={r.status} />
            <button onClick={() => open(r.id)} style={{ fontSize: 12, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, justifySelf: 'start' }}>
              {r.status === 'running' ? '查看监控' : r.status === 'failed' ? '查看日志' : '查看'}
            </button>
          </div>
        ))}
      </Card>
    </Page>
  )
}
