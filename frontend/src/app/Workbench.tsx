/** 工作台容器。Phase 1 为占位骨架；Phase 2 接入五大能力的真实推理与画布。 */
import { useApp } from '../appStore'
import type { Capability } from '../types'
import { Icon } from './ui'

const CAP_META: Record<Capability, [string, string]> = {
  detect: ['目标检测 / 智能识别', '开放词汇 · 在图中框出指定目标'],
  vqa: ['状态巡检 / 视觉问答', '对图片提自然语言问题做结构化判断'],
  ocr: ['文字提取 OCR', '识别图中文字的具体内容并可复制'],
  matting: ['抠图 / 分割', '把目标从背景中抠出，输出透明背景'],
  element: ['图片元素拆解', '把一张图自动拆成若干独立元素图层'],
}

export default function Workbench() {
  const capability = useApp((s) => s.capability)
  const [title, desc] = CAP_META[capability]
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, color: 'var(--text3)' }}>
      <div style={{ width: 60, height: 60, borderRadius: 16, background: 'var(--panel2)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={capability} size={28} color="var(--accent)" sw={1.6} />
      </div>
      <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--text)' }}>{title}</div>
      <div style={{ fontSize: 13 }}>{desc}</div>
      <div style={{ fontSize: 12, marginTop: 4, fontFamily: 'var(--mono)' }}>// 工作台正在接入真实推理（Phase 2）</div>
    </div>
  )
}
