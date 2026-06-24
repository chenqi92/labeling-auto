/** 系统设置（真实持久化，管理员可改）。 */
import { useEffect, useState } from 'react'
import { getSettings, putSettings } from '../../api2'
import { useApp } from '../../appStore'
import { Btn, Card, Page, PageHead } from '../ui'

const FIELDS: [string, string][] = [
  ['default_detect_model', '默认检测模型'],
  ['default_ocr_model', '默认 OCR 模型'],
  ['default_seg_model', '默认分割模型'],
  ['download_proxy', '模型下载代理'],
  ['data_path', '数据存储路径'],
  ['artifact_path', '产物存储路径'],
]

export default function Settings() {
  const isAdmin = useApp((s) => s.user?.role === 'admin')
  const [vals, setVals] = useState<Record<string, string>>({})
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  useEffect(() => { getSettings().then(setVals).catch(() => undefined) }, [])

  const save = async () => {
    setSaving(true)
    try { const r = await putSettings(vals); setVals(r); setDirty(false) }
    catch (e) { alert((e as Error).message) } finally { setSaving(false) }
  }

  return (
    <Page>
      <PageHead title="系统设置" sub={isAdmin ? '默认模型 · 代理 · 存储路径' : '只读 · 仅管理员可修改'} actions={isAdmin ? <Btn label={saving ? '保存中…' : '保存'} primary icon="check" onClick={save} disabled={!dirty || saving} /> : undefined} />
      <Card>
        {FIELDS.map((f, i) => (
          <div key={f[0]} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '14px 4px', borderBottom: i < FIELDS.length - 1 ? '1px solid var(--border-soft)' : 'none' }}>
            <span style={{ fontSize: 13, color: 'var(--text2)', flex: '0 0 160px' }}>{f[1]}</span>
            <input value={vals[f[0]] ?? ''} disabled={!isAdmin} onChange={(e) => { setVals({ ...vals, [f[0]]: e.target.value }); setDirty(true) }}
              style={{ flex: 1, background: isAdmin ? 'var(--panel2)' : 'transparent', border: `1px solid ${isAdmin ? 'var(--border)' : 'transparent'}`, borderRadius: 8, padding: '9px 12px', color: 'var(--text)', fontSize: 13, fontFamily: 'var(--mono)', outline: 'none', textAlign: isAdmin ? 'left' : 'right' }} />
          </div>
        ))}
      </Card>
    </Page>
  )
}
