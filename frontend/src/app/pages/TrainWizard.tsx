/** 新建训练任务向导（5 步）：任务类型 → 基础模型 → 数据集 → 超参 → 启动。 */
import { useState } from 'react'
import { createTraining } from '../../api2'
import { useApp } from '../../appStore'
import { selProject, useData } from '../../dataStore'
import { Btn, Card, Icon, Page, PageHead } from '../ui'

const STEPS = ['任务类型', '基础模型', '数据集', '超参', '启动']
const TYPES: [string, string, string][] = [
  ['detect', '目标检测', '框出目标位置 · 在你的标注上微调'],
]
const BASES: [string, string][] = [
  ['yolo11s.pt', '小 · 快 · 通用检测基座（推荐）'],
  ['yolo11m.pt', '中 · 精度更高 · 显存占用更大'],
  ['yolo11n.pt', '极小 · 最快 · 边缘部署'],
]

export default function TrainWizard() {
  const goView = useApp((s) => s.goView)
  const setFocusJob = useApp((s) => s.setFocusJob)
  const project = useData(selProject)
  const [step, setStep] = useState(1)
  const [type, setType] = useState('detect')
  const [base, setBase] = useState('yolo11s.pt')
  const [epochs, setEpochs] = useState(100)
  const [splitVal, setSplitVal] = useState(80)
  const [starting, setStarting] = useState(false)

  const start = async () => {
    if (!project) { alert('请先选择项目'); return }
    setStarting(true)
    try {
      const job = await createTraining({ project_id: project.id, name: `${project.name}-${type}`, task: type, base, epochs, train_ratio: splitVal / 100 })
      setFocusJob(job.id)
      goView('trainMonitor')
    } catch (e) { alert((e as Error).message) } finally { setStarting(false) }
  }

  return (
    <Page>
      <button onClick={() => goView('training')} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--text3)', background: 'none', border: 'none', cursor: 'pointer', marginBottom: 14, padding: 0 }}>
        <Icon name="back" size={14} color="currentColor" />返回训练列表
      </button>
      <PageHead title="新建训练任务" sub={`向导式 5 步 · 第 ${step} / 5 步 · 项目 ${project?.name ?? '—'}`} />
      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        {STEPS.map((s, i) => (
          <div key={i} onClick={() => setStep(i + 1)} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 7, cursor: 'pointer' }}>
            <div style={{ height: 4, borderRadius: 3, background: i + 1 <= step ? 'var(--accent)' : 'var(--border)' }} />
            <div style={{ fontSize: 11.5, color: i + 1 === step ? 'var(--accent)' : i + 1 < step ? 'var(--text2)' : 'var(--text3)', fontWeight: i + 1 === step ? 600 : 500 }}>{i + 1}. {s}</div>
          </div>
        ))}
      </div>
      <Card style={{ minHeight: 240 }}>
        {step === 1 && <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>{TYPES.map(([k, t, d]) => <Seg key={k} active={type === k} onClick={() => setType(k)} title={t} desc={d} />)}</div>}
        {step === 2 && <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{BASES.map(([k, d]) => <SegRow key={k} active={base === k} onClick={() => setBase(k)} title={k} desc={d} />)}</div>}
        {step === 3 && (
          <div>
            <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 9 }}>数据集（当前项目已标注图片）</div>
            <SegRow active onClick={() => undefined} title={project?.name ?? '—'} desc={`${project?.labeled ?? 0} 张已标注 · ${project?.classes ?? 0} 类 · ${project?.boxes ?? 0} 框`} />
            {(project?.labeled ?? 0) < 2 && <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, fontSize: 11.5, color: 'var(--amber)', background: 'var(--amber-g)', borderRadius: 7, padding: '8px 11px' }}><Icon name="warn" size={13} color="var(--amber)" />已标注样本不足 2 张，训练会失败。请先在工作台/标注页多标注几张。</div>}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16 }}>
              <span style={{ fontSize: 12, color: 'var(--text2)' }}>训练 / 验证划分</span>
              <input type="range" min={50} max={95} value={splitVal} onChange={(e) => setSplitVal(parseInt(e.target.value))} style={{ flex: 1, accentColor: 'var(--accent)' }} />
              <span style={{ fontSize: 12, fontFamily: 'var(--mono)', color: 'var(--text)' }}>{splitVal} / {100 - splitVal}</span>
            </div>
          </div>
        )}
        {step === 4 && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <NumField label="Epochs" value={epochs} onChange={setEpochs} />
            <FieldBox label="Batch Size" value="16" sub="受显存限制" />
            <FieldBox label="图像尺寸" value="640 × 640" />
            <FieldBox label="学习率" value="0.01" sub="cosine 衰减" />
            <FieldBox label="数据增强" value="开" sub="mosaic + flip" />
            <FieldBox label="基座" value={base} />
          </div>
        )}
        {step === 5 && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              <FieldBox label="任务" value={TYPES.find((t) => t[0] === type)?.[1] ?? type} />
              <FieldBox label="样本 / 轮次" value={`${project?.labeled ?? 0} 张 · ${epochs} epochs`} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--blue-g)', border: '1px solid rgba(61,139,255,.25)', borderRadius: 10, padding: '13px 15px' }}>
              <span style={{ width: 9, height: 9, borderRadius: '50%', background: 'var(--blue)' }} />
              <span style={{ fontSize: 13 }}>启动后进入任务队列，单卡串行训练；可在监控页看实时 Loss / mAP 曲线与日志。</span>
            </div>
          </div>
        )}
      </Card>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 20 }}>
        <button onClick={() => setStep((s) => Math.max(1, s - 1))} style={{ visibility: step > 1 ? 'visible' : 'hidden', fontSize: 13, fontWeight: 600, background: 'var(--panel2)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 20px', cursor: 'pointer', color: 'var(--text)' }}>上一步</button>
        {step < 5 ? <Btn label="下一步" primary onClick={() => setStep((s) => s + 1)} /> : <Btn label={starting ? '启动中…' : '确认启动训练'} primary icon="check" onClick={start} disabled={starting} />}
      </div>
    </Page>
  )
}

function Seg({ active, onClick, title, desc }: { active: boolean; onClick: () => void; title: string; desc: string }) {
  return <button onClick={onClick} style={{ textAlign: 'left', border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`, background: active ? 'var(--accent-ghost)' : 'var(--panel2)', borderRadius: 10, padding: '13px 14px', cursor: 'pointer', color: 'var(--text)' }}><div style={{ fontSize: 14, fontWeight: 600 }}>{title}</div><div style={{ fontSize: 11.5, color: 'var(--text3)', marginTop: 6, lineHeight: 1.5 }}>{desc}</div></button>
}
function SegRow({ active, onClick, title, desc }: { active: boolean; onClick: () => void; title: string; desc: string }) {
  return <button onClick={onClick} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`, background: active ? 'var(--accent-ghost)' : 'var(--panel2)', borderRadius: 10, padding: '13px 14px', cursor: 'pointer', color: 'var(--text)' }}><span style={{ fontSize: 13.5, fontWeight: 600, fontFamily: 'var(--mono)' }}>{title}</span><span style={{ fontSize: 11.5, color: 'var(--text3)' }}>{desc}</span></button>
}
function FieldBox({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return <div style={{ background: 'var(--panel2)', borderRadius: 9, padding: '13px 15px' }}><div style={{ fontSize: 11.5, color: 'var(--text3)' }}>{label}</div><div style={{ fontSize: 16, fontWeight: 600, fontFamily: 'var(--mono)', marginTop: 4, wordBreak: 'break-all' }}>{value}</div>{sub && <div style={{ fontSize: 10.5, color: 'var(--text3)', marginTop: 2 }}>{sub}</div>}</div>
}
function NumField({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return <div style={{ background: 'var(--panel2)', borderRadius: 9, padding: '13px 15px' }}><div style={{ fontSize: 11.5, color: 'var(--text3)' }}>{label}</div><input type="number" value={value} onChange={(e) => onChange(parseInt(e.target.value) || 1)} style={{ width: '100%', background: 'transparent', border: 'none', borderBottom: '1px solid var(--border)', color: 'var(--text)', fontSize: 16, fontWeight: 600, fontFamily: 'var(--mono)', marginTop: 4, outline: 'none' }} /></div>
}
