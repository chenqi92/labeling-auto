/** 资源监控（真实 GPU/显存/磁盘 + 运行中任务）。 */
import { useEffect, useState } from 'react'
import { getGpu, listJobs, type GpuInfo, type JobOut } from '../../api2'
import { Card, Page, PageHead, ProgressBar } from '../ui'

function Gauge({ label, val, sub, color }: { label: string; val: string; sub: string; color: string }) {
  return (
    <Card style={{ padding: 16 }}>
      <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, fontFamily: 'var(--mono)', color }}>{val}</div>
      <div style={{ fontSize: 11.5, color: 'var(--text3)', marginTop: 3 }}>{sub}</div>
    </Card>
  )
}

export default function Monitor() {
  const [gpu, setGpu] = useState<GpuInfo | null>(null)
  const [jobs, setJobs] = useState<JobOut[]>([])
  useEffect(() => {
    const tick = () => { getGpu().then(setGpu).catch(() => undefined); listJobs().then(setJobs).catch(() => undefined) }
    tick(); const t = setInterval(tick, 4000); return () => clearInterval(t)
  }, [])
  const running = jobs.filter((j) => j.status === 'running')
  const queued = jobs.filter((j) => j.status === 'queued').length
  const g = gpu

  return (
    <Page>
      <PageHead title="资源监控" sub="GPU / 显存 / 磁盘 · 运行中任务" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 18 }}>
        <Gauge label="GPU 利用率" val={g?.gpu_util_pct != null ? `${g.gpu_util_pct}%` : '—'} sub="NVIDIA 单卡" color="var(--blue)" />
        <Gauge label="显存" val={g ? `${g.gpu_used_gb ?? '—'} / ${g.gpu_total_gb} GB` : '—'} sub={`${g?.loaded?.length ?? 0} 模型常驻`} color="var(--accent)" />
        <Gauge label="磁盘" val={g?.disk_used_tb != null ? `${g.disk_used_tb} / ${g.disk_total_tb} TB` : '—'} sub="数据 + 产物" color="var(--text)" />
        <Gauge label="运行中任务" val={`${running.length}`} sub={`+ ${queued} 排队`} color="var(--green)" />
      </div>
      <Card>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>运行中任务</div>
        {running.length === 0 && <div style={{ fontSize: 12.5, color: 'var(--text3)' }}>当前没有运行中的任务。</div>}
        {running.map((t) => (
          <div key={t.id} style={{ marginBottom: 13 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 12.5, fontWeight: 500 }}>{t.type === 'training' ? t.project_name || '训练' : t.project_name} · {t.type}</span>
              <span style={{ fontSize: 11, color: 'var(--text3)' }}>{t.metric || t.detail}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <ProgressBar pct={t.progress} />
              <span style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text3)' }}>{t.progress}%</span>
            </div>
          </div>
        ))}
      </Card>
    </Page>
  )
}
