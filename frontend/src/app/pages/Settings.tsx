/** 系统设置（Phase 1 仅展示，Phase 6 接入持久化）。 */
import { Card, Page, PageHead } from '../ui'

const ROWS: [string, string][] = [
  ['默认检测模型', 'YOLOE-26-L'],
  ['默认 OCR 模型', 'PP-OCRv4'],
  ['默认分割模型', 'SAM-ViT-B'],
  ['模型下载代理', 'http://127.0.0.1:1081'],
  ['数据存储路径', '/data/vislab/projects'],
  ['产物存储路径', '/data/vislab/artifacts'],
]

export default function Settings() {
  return (
    <Page>
      <PageHead title="系统设置" sub="默认模型 · 代理 · 存储路径（持久化将在后续阶段接入）" />
      <Card>
        {ROWS.map((r, i) => (
          <div key={r[0]} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 4px', borderBottom: i < ROWS.length - 1 ? '1px solid var(--border-soft)' : 'none' }}>
            <span style={{ fontSize: 13, color: 'var(--text2)' }}>{r[0]}</span>
            <span style={{ fontSize: 13, fontFamily: 'var(--mono)', color: 'var(--text)' }}>{r[1]}</span>
          </div>
        ))}
      </Card>
    </Page>
  )
}
