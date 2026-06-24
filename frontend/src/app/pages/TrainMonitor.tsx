/** 训练监控：实时轮询任务，进度 + 由日志解析出的 mAP 曲线 + 日志 + 停止/克隆。 */
import { useEffect, useState } from 'react'
import { getJob, stopJob, type JobDetail } from '../../api2'
import { useApp } from '../../appStore'
import { Btn, Card, Icon, Page, PageHead, ProgressBar, StatusPill } from '../ui'

function sparkPath(data: number[], w: number, h: number, min = 0, max = 1): string {
  if (data.length < 2) return ''
  const dx = w / (data.length - 1)
  return data.map((v, i) => `${i === 0 ? 'M' : 'L'}${(i * dx).toFixed(1)} ${(h - ((v - min) / (max - min || 1)) * h).toFixed(1)}`).join(' ')
}

export default function TrainMonitor() {
  const jobId = useApp((s) => s.focusJob)
  const goView = useApp((s) => s.goView)
  const [job, setJob] = useState<JobDetail | null>(null)
  useEffect(() => {
    if (!jobId) return
    const tick = () => getJob(jobId).then(setJob).catch(() => undefined)
    tick(); const t = setInterval(tick, 2000); return () => clearInterval(t)
  }, [jobId])

  if (!jobId) return <Page><PageHead title="训练监控" sub="未选择任务" /><Card>请从训练列表选择一个任务查看。</Card></Page>
  if (!job) return <Page><PageHead title="训练监控" sub="加载中…" /></Page>

  // 从日志解析每个 epoch 的 mAP50
  const maps = job.logs.map((l) => l.match(/mAP50\s+([\d.]+)/)).filter(Boolean).map((m) => parseFloat((m as RegExpMatchArray)[1]))
  const curMap = maps.length ? maps[maps.length - 1] : 0
  const running = job.status === 'running' || job.status === 'queued'

  return (
    <Page>
      <button onClick={() => goView('training')} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--text3)', background: 'none', border: 'none', cursor: 'pointer', marginBottom: 14, padding: 0 }}>
        <Icon name="back" size={14} color="currentColor" />返回训练列表
      </button>
      <PageHead
        title={<span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>{job.project_name || job.id.slice(0, 8)}<StatusPill status={job.status} /></span>}
        sub={`${job.capability || '检测'} · ${job.detail || ''}`}
        actions={running ? <Btn label="停止训练" icon="close" onClick={async () => { await stopJob(job.id); }} /> : <Btn label="克隆为新任务" icon="copy" onClick={() => goView('trainWizard')} />}
      />
      <Card style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20, padding: '15px 18px' }}>
        <div style={{ fontSize: 13, fontFamily: 'var(--mono)', color: 'var(--text2)', whiteSpace: 'nowrap' }}>{job.detail || `进度 ${Math.round(job.progress)}%`}</div>
        <ProgressBar pct={job.progress} />
        <div style={{ fontSize: 13, fontFamily: 'var(--mono)', color: 'var(--accent)', whiteSpace: 'nowrap' }}>{Math.round(job.progress)}%</div>
        <div style={{ fontSize: 12.5, color: 'var(--text3)', whiteSpace: 'nowrap' }}>{job.eta || ''}</div>
      </Card>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <Card style={{ padding: 15 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>验证 mAP@50</span>
            <span style={{ fontSize: 14, fontWeight: 700, fontFamily: 'var(--mono)', color: 'var(--green)' }}>{curMap.toFixed(3)}</span>
          </div>
          {maps.length >= 2 ? (
            <svg width="100%" height="120" viewBox="0 0 320 120" preserveAspectRatio="none">
              <path d={`${sparkPath(maps, 320, 110, 0, 1)} L320 110 L0 110 Z`} fill="var(--green)" opacity="0.08" />
              <path d={sparkPath(maps, 320, 110, 0, 1)} fill="none" stroke="var(--green)" strokeWidth={2} />
            </svg>
          ) : <div style={{ height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: 'var(--text3)' }}>等待第一个 epoch…</div>}
        </Card>
        <Card style={{ padding: 15 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>指标</div>
          <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'var(--mono)', color: 'var(--text)' }}>{job.metric || '—'}</div>
          <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 8 }}>{job.done}/{job.total} epochs · 发起 {job.who}</div>
          {job.status === 'success' && job.result?.model_id != null && <div style={{ marginTop: 12, fontSize: 12.5, color: 'var(--green)', background: 'var(--green-g)', borderRadius: 7, padding: '8px 11px' }}>✓ 已上架为可用模型，可在「模型管理」看到</div>}
        </Card>
      </div>
      <Card style={{ padding: 15 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 11 }}>训练日志</div>
        <div style={{ background: 'var(--canvas)', borderRadius: 8, padding: 13, fontFamily: 'var(--mono)', fontSize: 11.5, lineHeight: 1.7, color: 'var(--text2)', maxHeight: 220, overflowY: 'auto' }}>
          {job.logs.length === 0 ? <span style={{ color: 'var(--text3)' }}>等待日志…</span> : job.logs.map((l, i) => <div key={i} style={{ color: l.includes('mAP') ? 'var(--green)' : l.includes('失败') ? 'var(--red)' : l.includes('上架') ? 'var(--accent)' : 'var(--text2)' }}>{l}</div>)}
        </div>
      </Card>
    </Page>
  )
}
