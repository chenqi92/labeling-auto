/** 批量处理：对整个项目批跑某能力，生成异步任务进入任务中心。 */
import { useState } from 'react'
import { createBatch } from '../../api2'
import { useApp } from '../../appStore'
import { selProject, useData } from '../../dataStore'
import { Btn, Card, Page, PageHead } from '../ui'

const CAPS: [string, string][] = [['detect', '目标检测'], ['vqa', '状态巡检 VQA'], ['ocr', '文字提取 OCR']]

export default function Batch() {
  const project = useData(selProject)
  const engines = useData((s) => s.engines)
  const goView = useApp((s) => s.goView)
  const [cap, setCap] = useState('detect')
  const [engine, setEngine] = useState('la')
  const [query, setQuery] = useState('航标')
  const [submitting, setSubmitting] = useState(false)

  const submit = async () => {
    if (!project) { alert('请先选择项目'); return }
    setSubmitting(true)
    try {
      await createBatch({ project_id: project.id, capability: cap, engine, query })
      goView('jobs')
    } catch (e) { alert((e as Error).message) } finally { setSubmitting(false) }
  }

  return (
    <Page>
      <PageHead title="批量处理" sub="对整个项目批跑能力，生成异步任务进入任务中心" />
      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 18 }}>
        <Card>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>配置批处理</div>
          <Field label="能力">
            <div style={{ display: 'flex', gap: 6 }}>
              {CAPS.map(([k, l]) => <button key={k} onClick={() => setCap(k)} style={seg(cap === k)}>{l}</button>)}
            </div>
          </Field>
          {cap === 'detect' && (
            <>
              <Field label="检测引擎">
                <select value={engine} onChange={(e) => setEngine(e.target.value)} style={inp}>
                  {(engines.length ? engines : [{ key: 'la', label: 'LocateAnything-3B' }]).map((en) => <option key={en.key} value={en.key}>{en.label}</option>)}
                </select>
              </Field>
              <Field label="目标类别（空格分隔）">
                <input value={query} onChange={(e) => setQuery(e.target.value)} style={inp} placeholder="航标 航标灯 船只 / ship buoy" />
              </Field>
            </>
          )}
          <Field label="目标范围">
            <div style={{ fontSize: 13, color: 'var(--text2)', background: 'var(--panel2)', border: '1px solid var(--border)', borderRadius: 8, padding: '11px 13px' }}>
              整个项目 · {project?.images ?? 0} 张图片
            </div>
          </Field>
          <div style={{ marginTop: 20 }}>
            <Btn label={submitting ? '提交中…' : '提交批处理任务'} primary icon="batch" onClick={submit} disabled={submitting || !project} />
          </div>
        </Card>
        <Card>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>说明</div>
          <div style={{ fontSize: 12.5, color: 'var(--text2)', lineHeight: 1.7, marginTop: 10 }}>
            批处理会对项目内每张图片依次跑所选能力，结果（检测框/巡检结论/OCR 文本）随任务进度落库。
            提交后自动跳转「任务中心」，可看进度、日志、停止与重看。单卡串行执行。
          </div>
        </Card>
      </div>
    </Page>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 15 }}>
      <div style={{ fontSize: 11.5, color: 'var(--text3)', marginBottom: 6 }}>{label}</div>
      {children}
    </div>
  )
}
const inp = { width: '100%', background: 'var(--panel2)', border: '1px solid var(--border)', borderRadius: 8, padding: '11px 13px', color: 'var(--text)', fontSize: 13, outline: 'none' } as const
const seg = (active: boolean) => ({ flex: 1, fontSize: 12.5, padding: '9px 0', borderRadius: 7, border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`, background: active ? 'var(--accent-ghost)' : 'var(--panel2)', color: active ? 'var(--accent)' : 'var(--text2)', cursor: 'pointer', fontWeight: active ? 600 : 500 }) as const
