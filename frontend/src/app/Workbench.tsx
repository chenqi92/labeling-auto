/** 工作台：左素材列表 + 中工具栏/画布 + 右结果面板。
 *  detect/vqa/ocr 接真实后端；matting/element 在 Phase 3 接入。 */
import { useEffect, useRef, useState } from 'react'
import { useApp } from '../appStore'
import { selActiveAnns, selActiveImage, useData } from '../dataStore'
import { detect, inspect, recognizeText } from '../api'
import { downloadBlob, elements as apiElements, exportElements, matte } from '../api2'
import type { Capability, ProjImage } from '../types'
import WbCanvas from './WbCanvas'
import { Icon } from './ui'
import { toast } from './overlays'

const CAP_LABEL: Record<Capability, string> = {
  detect: '目标检测 / 智能识别', vqa: '状态巡检 / 视觉问答', ocr: '文字提取 OCR', matting: '抠图 / 分割', element: '图片元素拆解',
}

export default function Workbench() {
  const capability = useApp((s) => s.capability)
  const image = useData(selActiveImage)
  return (
    <div style={{ height: '100%', display: 'flex', minWidth: 0 }}>
      <ImageList />
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <Toolbar />
        <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
          {!image ? <EmptyCanvas />
            : capability === 'matting' ? <MattingCanvas />
            : capability === 'element' ? <ElementGallery />
            : <WbCanvas readOnly={capability !== 'detect'} />}
        </div>
      </div>
      <ResultPanel />
    </div>
  )
}

function EmptyCanvas() {
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, color: 'var(--text3)', background: 'var(--canvas)' }}>
      <Icon name="proj" size={36} color="var(--text3)" sw={1.4} />
      <div style={{ fontSize: 13 }}>该项目还没有图片 · 在左侧上传后开始</div>
    </div>
  )
}

function ImageList() {
  const images = useData((s) => s.images)
  const activeImageId = useData((s) => s.activeImageId)
  const busy = useData((s) => s.busy)
  const uploading = useData((s) => s.uploading)
  const setActiveImage = useData((s) => s.setActiveImage)
  const uploadFiles = useData((s) => s.uploadFiles)
  const imgQuery = useData((s) => s.imgQuery)
  const [filter, setFilter] = useState<'all' | 'todo' | 'done'>('all')
  const q = imgQuery.trim().toLowerCase()
  const shown = images.filter((i) => (filter === 'all' ? true : filter === 'done' ? i.status === 'done' : i.status !== 'done') && (!q || i.filename.toLowerCase().includes(q)))

  return (
    <div style={{ width: 196, flex: '0 0 196px', background: 'var(--chrome)', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div style={{ padding: '12px 12px 9px', borderBottom: '1px solid var(--border-soft)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 9 }}>
          <span style={{ fontSize: 12, fontWeight: 600 }}>素材 · {images.length}</span>
          <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--accent)', background: 'var(--accent-ghost)', borderRadius: 6, padding: '5px 8px', cursor: uploading ? 'wait' : 'pointer' }}>
            <Icon name="plus" size={12} color="currentColor" sw={2.2} />{uploading ? '上传中' : '上传'}
            <input type="file" accept="image/*" multiple disabled={uploading} style={{ display: 'none' }} onChange={async (e) => { const f = Array.from(e.target.files ?? []); e.target.value = ''; if (f.length) { try { await uploadFiles(f) } catch (err) { toast(`上传失败：${(err as Error).message}`) } } }} />
          </label>
        </div>
        <div style={{ display: 'flex', gap: 5 }}>
          {([['all', '全部'], ['todo', '未处理'], ['done', '已处理']] as const).map(([k, l]) => (
            <button key={k} onClick={() => setFilter(k)} style={{ flex: 1, fontSize: 11, padding: '5px 0', borderRadius: 6, border: `1px solid ${filter === k ? 'var(--accent)' : 'var(--border)'}`, background: filter === k ? 'var(--accent-ghost)' : 'transparent', color: filter === k ? 'var(--accent)' : 'var(--text2)', cursor: 'pointer' }}>{l}</button>
          ))}
        </div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9, alignContent: 'start' }}>
        {shown.map((im: ProjImage) => {
          const active = im.id === activeImageId
          return (
            <div key={im.id} onClick={() => setActiveImage(im.id)} style={{ position: 'relative', width: '100%', borderRadius: 8, overflow: 'hidden', cursor: 'pointer', border: `2px solid ${active ? 'var(--accent)' : 'transparent'}`, background: 'var(--panel2)' }}>
              <img src={im.url} alt={im.filename} style={{ width: '100%', height: 54, objectFit: 'cover', display: 'block' }} />
              <span style={{ position: 'absolute', top: 5, right: 5, width: 7, height: 7, borderRadius: '50%', background: im.status === 'done' ? 'var(--green)' : 'var(--text3)' }} />
              {busy[im.id] && <span style={{ position: 'absolute', top: 5, left: 5, width: 12, height: 12, border: '2px solid rgba(255,255,255,.3)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin .8s linear infinite' }} />}
              <div style={{ fontSize: 11, padding: '3px 4px', color: active ? 'var(--text)' : 'var(--text2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{im.filename}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ---------- 工具栏（按能力切换） ----------
function Toolbar() {
  const capability = useApp((s) => s.capability)
  const label = CAP_LABEL[capability]
  return (
    <div style={{ flex: '0 0 auto', borderBottom: '1px solid var(--border)', background: 'var(--chrome)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, rowGap: 8, padding: '10px 16px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--accent-ghost)', border: '1px solid rgba(25,200,184,.25)', borderRadius: 8, padding: '7px 11px', whiteSpace: 'nowrap' }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--accent)' }} />
          <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--accent)' }}>{label}</span>
        </div>
        {capability === 'detect' && <DetectControls />}
        {capability === 'vqa' && <VqaControls />}
        {capability === 'ocr' && <OcrControls />}
        {capability === 'matting' && <MattingControls />}
        {capability === 'element' && <ElementControls />}
      </div>
    </div>
  )
}

const runBtnStyle = (disabled: boolean) => ({
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
  background: disabled ? 'var(--panel2)' : 'var(--accent)', color: disabled ? 'var(--text3)' : '#04140f',
  border: disabled ? '1px solid var(--border)' : 'none', borderRadius: 8, padding: '9px 16px',
  fontSize: 13.5, fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer',
}) as const

function DetectControls() {
  const engines = useData((s) => s.engines)
  const images = useData((s) => s.images)
  const activeImageId = useData((s) => s.activeImageId)
  const setBusy = useData((s) => s.setBusy)
  const applyDetections = useData((s) => s.applyDetections)
  const { tags, setTags, engine, setEngine, thresh, setThresh, mode, setMode } = useDetectCfg()
  const [input, setInput] = useState('')
  const [running, setRunning] = useState(false)
  const isYoloe = engine.startsWith('yoloe')

  const addTag = (v: string) => { const t = v.trim(); if (t && !tags.includes(t)) setTags([...tags, t]) }
  const run = async (all: boolean) => {
    const q = tags.join(' ').trim()
    if (!q) { toast('请先输入检测目标（类别）'); return }
    const ids = all ? images.map((i) => i.id) : activeImageId ? [activeImageId] : []
    if (!ids.length) { toast('请先选择图片'); return }
    setRunning(true)
    try {
      for (const id of ids) {
        setBusy(id, true)
        try {
          const res = await detect({ image_id: id, query: q, task: 'detection', engine, mode })
          // 阈值过滤：无分数(LA)恒保留；YOLOE 有分数则按阈值过滤
          await applyDetections(id, res.boxes.filter((b) => (b.score ?? 1) >= thresh))
        } finally { setBusy(id, false) }
      }
    } catch (e) { toast(`检测失败：${(e as Error).message}`) } finally { setRunning(false) }
  }

  return (
    <>
      {engines.length > 0 && (
        <select value={engine} onChange={(e) => setEngine(e.target.value)} style={selStyle} title="检测引擎">
          {engines.map((en) => <option key={en.key} value={en.key}>{en.label}</option>)}
        </select>
      )}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6, background: 'var(--panel2)', border: '1px solid var(--border)', borderRadius: 8, padding: '5px 9px', minWidth: 220 }}>
        {tags.map((t) => (
          <span key={t} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, background: 'var(--accent-ghost)', color: 'var(--accent)', borderRadius: 6, padding: '3px 6px 3px 8px' }}>
            {t}<button onClick={() => setTags(tags.filter((x) => x !== t))} style={{ display: 'flex', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', padding: 0 }}><Icon name="close" size={11} color="currentColor" sw={2.4} /></button>
          </span>
        ))}
        <input value={input} onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); addTag(input); setInput('') } else if (e.key === 'Backspace' && !input && tags.length) setTags(tags.slice(0, -1)) }}
          placeholder={isYoloe ? '英文常见类名，回车添加：ship buoy person' : '中/英描述目标，回车添加：航标 损坏的浮筒'}
          style={{ flex: 1, minWidth: 130, background: 'transparent', border: 'none', outline: 'none', color: 'var(--text)', fontSize: 12.5 }} />
      </div>
      {!isYoloe && (
        <div style={{ display: 'flex', gap: 4, background: 'var(--panel2)', borderRadius: 7, padding: 3 }}>
          {(['slow', 'hybrid', 'fast'] as const).map((m, i) => (
            <button key={m} onClick={() => setMode(m)} style={segStyle(mode === m)}>{['稳', '衡', '快'][i]}</button>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }} title="置信度阈值（前端过滤显示）">
        <span style={{ fontSize: 11.5, color: 'var(--text3)' }}>阈值</span>
        <input type="range" min={0} max={1} step={0.05} value={thresh} onChange={(e) => setThresh(parseFloat(e.target.value))} style={{ width: 80, accentColor: 'var(--accent)' }} />
        <span style={{ fontSize: 12, fontFamily: 'var(--mono)', color: 'var(--text2)', width: 32 }}>{Math.round(thresh * 100)}%</span>
      </div>
      <button onClick={() => run(false)} disabled={running} style={runBtnStyle(running)}>
        {running ? <span style={{ width: 13, height: 13, border: '2px solid rgba(255,255,255,.3)', borderTopColor: 'currentColor', borderRadius: '50%', animation: 'spin .8s linear infinite' }} /> : <Icon name="play" size={14} color="currentColor" />}
        {running ? '推理中…' : '检测当前'}
      </button>
      <button onClick={() => run(true)} disabled={running} style={{ display: 'flex', alignItems: 'center', gap: 7, background: 'var(--panel2)', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 14px', fontSize: 13, fontWeight: 600, color: 'var(--text)', cursor: 'pointer' }}>
        <Icon name="batch" size={14} color="currentColor" sw={2} />全部
      </button>
    </>
  )
}

// 检测配置：用 module 级简单状态（每能力独立，跨切换保留）
const detectCfgState = { tags: ['航标'] as string[], engine: 'la', thresh: 0.3, mode: 'slow' as 'slow' | 'hybrid' | 'fast' }
function useDetectCfg() {
  const [, force] = useState(0)
  const rerender = () => force((n) => n + 1)
  return {
    tags: detectCfgState.tags, setTags: (v: string[]) => { detectCfgState.tags = v; rerender() },
    engine: detectCfgState.engine, setEngine: (v: string) => { detectCfgState.engine = v; rerender() },
    thresh: detectCfgState.thresh, setThresh: (v: number) => { detectCfgState.thresh = v; rerender() },
    mode: detectCfgState.mode, setMode: (v: 'slow' | 'hybrid' | 'fast') => { detectCfgState.mode = v; rerender() },
  }
}

const vqaState = { q: '航标是否损坏？\n航标灯是否正常竖立？' }
function VqaControls() {
  const activeImageId = useData((s) => s.activeImageId)
  const setBusy = useData((s) => s.setBusy)
  const setInspection = useData((s) => s.setInspection)
  const [running, setRunning] = useState(false)
  const run = async () => {
    if (!activeImageId) { toast('请先选择图片'); return }
    if (!vqaState.q.trim()) { toast('请先输入要判断的问题'); return }
    setRunning(true); setBusy(activeImageId, true)
    try {
      const res = await inspect({ image_id: activeImageId, query: vqaState.q })
      setInspection(activeImageId, res)
    } catch (e) { toast(`巡检失败：${(e as Error).message}`) } finally { setRunning(false); setBusy(activeImageId, false) }
  }
  return (
    <>
      <span style={{ fontSize: 11, color: 'var(--amber)', display: 'flex', alignItems: 'center', gap: 5 }}><Icon name="warn" size={12} color="currentColor" sw={1.8} />VLM · 占显存较高 · 空闲自动释放</span>
      <div style={{ flex: 1 }} />
      <button onClick={run} disabled={running} style={runBtnStyle(running)}>
        {running ? <span style={{ width: 13, height: 13, border: '2px solid rgba(255,255,255,.3)', borderTopColor: 'currentColor', borderRadius: '50%', animation: 'spin .8s linear infinite' }} /> : <Icon name="play" size={14} color="currentColor" />}
        {running ? '巡检中…' : '巡检当前'}
      </button>
    </>
  )
}

function OcrControls() {
  const activeImageId = useData((s) => s.activeImageId)
  const setBusy = useData((s) => s.setBusy)
  const setRecognition = useData((s) => s.setRecognition)
  const [running, setRunning] = useState(false)
  const run = async () => {
    if (!activeImageId) { toast('请先选择图片'); return }
    setRunning(true); setBusy(activeImageId, true)
    try {
      const res = await recognizeText({ image_id: activeImageId })
      setRecognition(activeImageId, res)
    } catch (e) { toast(`识别失败：${(e as Error).message}`) } finally { setRunning(false); setBusy(activeImageId, false) }
  }
  return (
    <>
      <span style={{ fontSize: 11, color: 'var(--text3)' }}>VLM-OCR · 输出可复制文本</span>
      <div style={{ flex: 1 }} />
      <button onClick={run} disabled={running} style={runBtnStyle(running)}>
        {running ? <span style={{ width: 13, height: 13, border: '2px solid rgba(255,255,255,.3)', borderTopColor: 'currentColor', borderRadius: '50%', animation: 'spin .8s linear infinite' }} /> : <Icon name="play" size={14} color="currentColor" />}
        {running ? '识别中…' : '识别当前'}
      </button>
    </>
  )
}

// ---------- 右侧结果面板 ----------
function ResultPanel() {
  const capability = useApp((s) => s.capability)
  return (
    <div style={{ width: 320, flex: '0 0 320px', background: 'var(--chrome)', borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {capability === 'detect' && <DetectResults />}
      {capability === 'vqa' && <VqaResults />}
      {capability === 'ocr' && <OcrResults />}
      {capability === 'matting' && <MattingResults />}
      {capability === 'element' && <ElementResults />}
    </div>
  )
}

// ---------- 抠图 / 分割 ----------
const mattingState = { classes: 'ship', feather: 2 }
function MattingControls() {
  const activeImageId = useData((s) => s.activeImageId)
  const setBusy = useData((s) => s.setBusy)
  const setMatte = useData((s) => s.setMatte)
  const matMode = useData((s) => s.matMode)
  const matBox = useData((s) => s.matBox)
  const matPoints = useData((s) => s.matPoints)
  const setMatMode = useData((s) => s.setMatMode)
  const clearMatPoints = useData((s) => s.clearMatPoints)
  const [running, setRunning] = useState(false)
  const run = async () => {
    if (!activeImageId) { toast('请先选择图片'); return }
    if (matMode === 'box' && !matBox) { toast('请先在画布上拖拽框选要抠的区域'); return }
    if (matMode === 'point' && matPoints.length === 0) { toast('请先在画布上点选：左键点前景目标，Shift/右键点背景'); return }
    setRunning(true); setBusy(activeImageId, true)
    try {
      const res = await matte({
        image_id: activeImageId, mode: matMode,
        classes: mattingState.classes.split(/\s+/).filter(Boolean),
        box: matMode === 'box' ? matBox ?? undefined : undefined,
        points: matMode === 'point' ? matPoints.map((p) => [p.x, p.y]) : undefined,
        point_labels: matMode === 'point' ? matPoints.map((p) => (p.fg ? 1 : 0)) : undefined,
        feather: mattingState.feather,
      })
      setMatte(activeImageId, { png_b64: res.png_b64, instances: res.instances })
    } catch (e) { toast(`抠图失败：${(e as Error).message}`) } finally { setRunning(false); setBusy(activeImageId, false) }
  }
  return (
    <>
      <div style={{ display: 'flex', gap: 4, background: 'var(--panel2)', borderRadius: 7, padding: 3 }}>
        {([['auto', '一键去背'], ['text', '文字抠图'], ['box', '框选(SAM)'], ['point', '点选(SAM)']] as const).map(([k, l]) => (
          <button key={k} onClick={() => setMatMode(k)} style={segStyle(matMode === k)}>{l}</button>
        ))}
      </div>
      {matMode === 'text' && (
        <input defaultValue={mattingState.classes} onChange={(e) => { mattingState.classes = e.target.value }} placeholder="英文目标，如 ship boat" style={{ background: 'var(--panel2)', border: '1px solid var(--border)', borderRadius: 8, padding: '7px 11px', color: 'var(--text)', fontSize: 12.5, outline: 'none', width: 180 }} />
      )}
      {matMode === 'box' && <span style={{ fontSize: 11.5, color: matBox ? 'var(--green)' : 'var(--amber)' }}>{matBox ? '已框选 ✓ 可重新拖拽' : '画布上拖拽框选目标'}</span>}
      {matMode === 'point' && (
        <span style={{ fontSize: 11.5, color: matPoints.length ? 'var(--green)' : 'var(--amber)', display: 'flex', alignItems: 'center', gap: 8 }}>
          已点 {matPoints.length} · 左键前景 / Shift·右键背景
          {matPoints.length > 0 && <button onClick={clearMatPoints} style={{ fontSize: 11, color: 'var(--text2)', background: 'var(--panel2)', border: '1px solid var(--border)', borderRadius: 6, padding: '3px 8px', cursor: 'pointer' }}>清空点</button>}
        </span>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        <span style={{ fontSize: 11.5, color: 'var(--text3)' }}>羽化</span>
        <input type="range" min={0} max={10} defaultValue={mattingState.feather} onChange={(e) => { mattingState.feather = parseInt(e.target.value) }} style={{ width: 70, accentColor: 'var(--accent)' }} />
      </div>
      <div style={{ flex: 1 }} />
      <button onClick={run} disabled={running} style={runBtnStyle(running)}>
        {running ? <span style={{ width: 13, height: 13, border: '2px solid rgba(255,255,255,.3)', borderTopColor: 'currentColor', borderRadius: '50%', animation: 'spin .8s linear infinite' }} /> : <Icon name="matting" size={14} color="currentColor" />}
        {running ? '抠图中…' : '抠图'}
      </button>
    </>
  )
}

const CHECKER = 'linear-gradient(45deg,#555 25%,transparent 25%),linear-gradient(-45deg,#555 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#555 75%),linear-gradient(-45deg,transparent 75%,#555 75%)'
function MattingCanvas() {
  const activeImageId = useData((s) => s.activeImageId)
  const image = useData(selActiveImage)
  const mattes = useData((s) => s.mattes)
  const matMode = useData((s) => s.matMode)
  const matPoints = useData((s) => s.matPoints)
  const setMatBox = useData((s) => s.setMatBox)
  const addMatPoint = useData((s) => s.addMatPoint)
  const res = activeImageId ? mattes[activeImageId] : undefined
  const outerRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const [drag, setDrag] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null)
  const [, setTick] = useState(0)
  const boxMode = !res && !!image && matMode === 'box'
  const pointMode = !res && !!image && matMode === 'point'

  useEffect(() => {
    if (!outerRef.current) return
    const ro = new ResizeObserver(() => setTick((t) => t + 1))
    ro.observe(outerRef.current)
    return () => ro.disconnect()
  }, [])

  const rel = (cx: number, cy: number) => {
    const r = outerRef.current!.getBoundingClientRect()
    return { x: cx - r.left, y: cy - r.top }
  }
  const toImgPx = (cx: number, cy: number): [number, number] => {
    const ir = imgRef.current!.getBoundingClientRect()
    const x = Math.max(0, Math.min(image!.width, ((cx - ir.left) * image!.width) / ir.width))
    const y = Math.max(0, Math.min(image!.height, ((cy - ir.top) * image!.height) / ir.height))
    return [x, y]
  }
  const screenOf = (px: number, py: number) => {
    const img = imgRef.current, outer = outerRef.current
    if (!img || !outer || !image) return null
    const ir = img.getBoundingClientRect(), or = outer.getBoundingClientRect()
    return { left: ir.left - or.left + (px * ir.width) / image.width, top: ir.top - or.top + (py * ir.height) / image.height }
  }

  const onDown = (e: React.PointerEvent) => {
    if (!boxMode) return
    const p = rel(e.clientX, e.clientY)
    setDrag({ x0: p.x, y0: p.y, x1: p.x, y1: p.y })
  }
  const onMove = (e: React.PointerEvent) => {
    if (!drag) return
    const p = rel(e.clientX, e.clientY)
    setDrag((d) => (d ? { ...d, x1: p.x, y1: p.y } : d))
  }
  const onUp = () => {
    if (!drag || !image || !imgRef.current) { return }
    const x1 = Math.min(drag.x0, drag.x1), y1 = Math.min(drag.y0, drag.y1)
    const x2 = Math.max(drag.x0, drag.x1), y2 = Math.max(drag.y0, drag.y1)
    const or = outerRef.current!.getBoundingClientRect()
    const [ix1, iy1] = toImgPx(or.left + x1, or.top + y1)
    const [ix2, iy2] = toImgPx(or.left + x2, or.top + y2)
    if (ix2 - ix1 > 4 && iy2 - iy1 > 4) setMatBox([ix1, iy1, ix2, iy2])
    else setDrag(null)
  }
  const onClick = (e: React.MouseEvent) => {
    if (!pointMode || !imgRef.current) return
    const [x, y] = toImgPx(e.clientX, e.clientY)
    addMatPoint({ x, y, fg: !e.shiftKey })
  }
  const onContext = (e: React.MouseEvent) => {
    if (!pointMode) return
    e.preventDefault()
    if (!imgRef.current) return
    const [x, y] = toImgPx(e.clientX, e.clientY)
    addMatPoint({ x, y, fg: false })
  }

  return (
    <div ref={outerRef} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onClick={onClick} onContextMenu={onContext}
      style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', background: 'var(--canvas)', backgroundImage: res ? `${CHECKER}` : undefined, backgroundSize: '20px 20px', backgroundPosition: '0 0,0 10px,10px -10px,-10px 0', cursor: boxMode || pointMode ? 'crosshair' : 'default', touchAction: 'none', userSelect: 'none' }}>
      {res ? <img src={`data:image/png;base64,${res.png_b64}`} alt="matte" style={{ maxWidth: '82%', maxHeight: '88%', objectFit: 'contain' }} />
        : image ? <img ref={imgRef} src={image.url} alt={image.filename} draggable={false} style={{ maxWidth: '78%', maxHeight: '85%', objectFit: 'contain', opacity: 0.9, borderRadius: 4 }} />
        : null}
      {boxMode && drag && <div style={{ position: 'absolute', left: Math.min(drag.x0, drag.x1), top: Math.min(drag.y0, drag.y1), width: Math.abs(drag.x1 - drag.x0), height: Math.abs(drag.y1 - drag.y0), border: '2px solid var(--accent)', background: 'rgba(25,200,184,.15)', pointerEvents: 'none' }} />}
      {pointMode && matPoints.map((p, i) => {
        const s = screenOf(p.x, p.y)
        return s ? <span key={i} style={{ position: 'absolute', left: s.left - 6, top: s.top - 6, width: 12, height: 12, borderRadius: '50%', border: '2px solid #fff', background: p.fg ? 'var(--green)' : 'var(--red)', pointerEvents: 'none', boxShadow: '0 0 4px rgba(0,0,0,.6)' }} /> : null
      })}
      {(boxMode || pointMode) && <div style={{ position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)', pointerEvents: 'none', background: 'rgba(0,0,0,.55)', borderRadius: 20, padding: '5px 13px', fontSize: 11, color: 'rgba(255,255,255,.85)' }}>{boxMode ? '拖拽框选目标，再点「抠图」' : '左键点前景 / Shift·右键点背景，再点「抠图」'}</div>}
    </div>
  )
}

function MattingResults() {
  const activeImageId = useData((s) => s.activeImageId)
  const mattes = useData((s) => s.mattes)
  const res = activeImageId ? mattes[activeImageId] : undefined
  const download = () => {
    if (!res) return
    const a = document.createElement('a'); a.href = `data:image/png;base64,${res.png_b64}`; a.download = 'matte.png'; a.click()
  }
  return (
    <>
      <div style={{ padding: '13px 15px', borderBottom: '1px solid var(--border-soft)' }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>抠图结果</div>
        <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>透明 PNG · 棋盘格预览</div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 13 }}>
        {!res && <div style={{ fontSize: 12.5, color: 'var(--text3)' }}>选模式后点「抠图」。一键去背用 rembg/YOLOE-seg，框选用 grabCut。</div>}
        {res?.instances.map((it, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 11px', background: 'var(--panel2)', borderRadius: 8, marginBottom: 7 }}>
            <span style={{ fontSize: 12.5, fontWeight: 500 }}>{it.label}</span>
            <span style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text3)' }}>{it.area_pct}%</span>
          </div>
        ))}
      </div>
      {res && <div style={{ borderTop: '1px solid var(--border-soft)', padding: '11px 13px' }}>
        <button onClick={download} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, background: 'var(--accent)', color: '#04140f', border: 'none', borderRadius: 8, padding: 9, fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
          <Icon name="download" size={14} color="currentColor" />导出透明 PNG
        </button>
      </div>}
    </>
  )
}

// ---------- 元素拆解 ----------
const elState = { classes: '', granularity: 'instance' }
// 记录每张图拆解时用的类名，导出时复用同一组，保证后端重算出的实例顺序与已选一致
const elClassesByImage: Record<string, string[]> = {}
function ElementControls() {
  const activeImageId = useData((s) => s.activeImageId)
  const setBusy = useData((s) => s.setBusy)
  const setElements = useData((s) => s.setElements)
  const [, force] = useState(0)
  const [running, setRunning] = useState(false)
  const run = async () => {
    if (!activeImageId) { toast('请先选择图片'); return }
    setRunning(true); setBusy(activeImageId, true)
    try {
      const cls = elState.classes.split(/\s+/).filter(Boolean)
      elClassesByImage[activeImageId] = cls
      const res = await apiElements({ image_id: activeImageId, classes: cls, granularity: elState.granularity })
      setElements(activeImageId, res.elements)
    } catch (e) { toast(`拆解失败：${(e as Error).message}`) } finally { setRunning(false); setBusy(activeImageId, false) }
  }
  return (
    <>
      <span style={{ fontSize: 11.5, color: 'var(--text3)' }}>粒度</span>
      <div style={{ display: 'flex', gap: 4, background: 'var(--panel2)', borderRadius: 7, padding: 3 }}>
        {([['coarse', '粗·大块'], ['instance', '细·实例']] as const).map(([k, l]) => (
          <button key={k} onClick={() => { elState.granularity = k; force((n) => n + 1) }} style={segStyle(elState.granularity === k)}>{l}</button>
        ))}
      </div>
      <input defaultValue={elState.classes} onChange={(e) => { elState.classes = e.target.value }} placeholder="可选英文类名，留空用通用词表" style={{ flex: 1, background: 'var(--panel2)', border: '1px solid var(--border)', borderRadius: 8, padding: '7px 11px', color: 'var(--text)', fontSize: 12.5, outline: 'none', minWidth: 160 }} />
      <button onClick={run} disabled={running} style={runBtnStyle(running)}>
        {running ? <span style={{ width: 13, height: 13, border: '2px solid rgba(255,255,255,.3)', borderTopColor: 'currentColor', borderRadius: '50%', animation: 'spin .8s linear infinite' }} /> : <Icon name="element" size={14} color="currentColor" />}
        {running ? '拆解中…' : '拆解'}
      </button>
    </>
  )
}

function ElementGallery() {
  const activeImageId = useData((s) => s.activeImageId)
  const elementsMap = useData((s) => s.elementsMap)
  const elementSel = useData((s) => s.elementSel)
  const toggleElement = useData((s) => s.toggleElement)
  const els = activeImageId ? elementsMap[activeImageId] ?? [] : []
  const sel = activeImageId ? elementSel[activeImageId] ?? {} : {}
  if (els.length === 0) return <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text3)', fontSize: 13, background: 'var(--canvas)' }}>点「拆解」把图炸开成独立元素</div>
  return (
    <div style={{ height: '100%', overflowY: 'auto', background: 'var(--canvas)', padding: '22px 26px' }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: '#fff', marginBottom: 16 }}>拆解结果 · {els.filter((e) => sel[e.idx]).length} / {els.length} 个元素</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: 18 }}>
        {els.map((el) => (
          <div key={el.idx} onClick={() => activeImageId && toggleElement(activeImageId, el.idx)} style={{ position: 'relative', border: `2px solid ${sel[el.idx] ? 'var(--accent)' : 'transparent'}`, background: 'var(--panel2)', borderRadius: 11, padding: 8, cursor: 'pointer' }}>
            <div style={{ width: '100%', aspectRatio: '1', borderRadius: 8, backgroundImage: `${CHECKER}`, backgroundSize: '14px 14px', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
              <img src={`data:image/png;base64,${el.thumb_b64}`} alt={el.name} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
            </div>
            <div style={{ position: 'absolute', top: 13, right: 13, width: 19, height: 19, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', background: sel[el.idx] ? 'var(--accent)' : 'rgba(0,0,0,.5)', border: `1px solid ${sel[el.idx] ? 'var(--accent)' : 'rgba(255,255,255,.3)'}` }}>
              {sel[el.idx] && <Icon name="check" size={11} color="#04140f" sw={3} />}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 500, color: '#fff' }}>{el.name}</span>
              <span style={{ fontSize: 10.5, fontFamily: 'var(--mono)', color: 'rgba(255,255,255,.5)' }}>{el.area_pct}%</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function ElementResults() {
  const activeImageId = useData((s) => s.activeImageId)
  const elementsMap = useData((s) => s.elementsMap)
  const elementSel = useData((s) => s.elementSel)
  const els = activeImageId ? elementsMap[activeImageId] ?? [] : []
  const sel = activeImageId ? elementSel[activeImageId] ?? {} : {}
  const exportZip = async () => {
    if (!activeImageId) return
    try {
      const selected = els.filter((e) => sel[e.idx]).map((e) => e.idx)
      downloadBlob(await exportElements({ image_id: activeImageId, classes: elClassesByImage[activeImageId] ?? [], selected }), 'elements.zip')
    } catch (e) { toast((e as Error).message) }
  }
  return (
    <>
      <div style={{ padding: '13px 15px', borderBottom: '1px solid var(--border-soft)' }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>元素清单</div>
        <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>已选 {els.filter((e) => sel[e.idx]).length} / {els.length}</div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 9 }}>
        {els.length === 0 && <div style={{ fontSize: 12.5, color: 'var(--text3)', padding: 8 }}>拆解后这里列出每个元素，可勾选导出。</div>}
        {els.map((el) => (
          <div key={el.idx} onClick={() => activeImageId && useData.getState().toggleElement(activeImageId, el.idx)} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '9px 10px', background: 'var(--panel2)', borderRadius: 9, marginBottom: 7, cursor: 'pointer' }}>
            <div style={{ width: 18, height: 18, borderRadius: 6, flex: '0 0 18px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: sel[el.idx] ? 'var(--accent)' : 'rgba(0,0,0,.4)', border: `1px solid ${sel[el.idx] ? 'var(--accent)' : 'var(--border)'}` }}>{sel[el.idx] && <Icon name="check" size={11} color="#04140f" sw={3} />}</div>
            <div style={{ width: 34, height: 34, borderRadius: 7, flex: '0 0 34px', backgroundImage: CHECKER, backgroundSize: '10px 10px', overflow: 'hidden' }}><img src={`data:image/png;base64,${el.thumb_b64}`} alt={el.name} style={{ width: '100%', height: '100%', objectFit: 'contain' }} /></div>
            <div style={{ flex: 1 }}><div style={{ fontSize: 12.5, fontWeight: 500 }}>{el.name}</div><div style={{ fontSize: 10.5, fontFamily: 'var(--mono)', color: 'var(--text3)' }}>{el.cls}</div></div>
            <span style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text2)' }}>{el.area_pct}%</span>
          </div>
        ))}
      </div>
      {els.length > 0 && <div style={{ borderTop: '1px solid var(--border-soft)', padding: '11px 13px' }}>
        <button onClick={exportZip} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, background: 'var(--accent)', color: '#04140f', border: 'none', borderRadius: 8, padding: 9, fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
          <Icon name="download" size={14} color="currentColor" />导出选中元素 zip
        </button>
      </div>}
    </>
  )
}

function DetectResults() {
  const anns = useData(selActiveAnns)
  const classes = useData((s) => s.classes)
  const selectedIdx = useData((s) => s.selectedIdx)
  const setSelectedIdx = useData((s) => s.setSelectedIdx)
  const activeImageId = useData((s) => s.activeImageId)
  const saveAnnotations = useData((s) => s.saveAnnotations)
  const goView = useApp((s) => s.goView)
  const nameOf = (ci: number) => classes.find((c) => c.id === ci)?.name ?? `#${ci}`
  const colorOf = (ci: number) => classes.find((c) => c.id === ci)?.color ?? '#3d8bff'
  const del = (i: number) => { if (activeImageId) saveAnnotations(activeImageId, anns.filter((_, k) => k !== i)) }

  return (
    <>
      <div style={{ padding: '13px 15px', borderBottom: '1px solid var(--border-soft)' }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>检测结果</div>
        <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{anns.length} 个标注 · 点选高亮 / 可删</div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 9 }}>
        {anns.length === 0 && <div style={{ padding: 16, fontSize: 12.5, color: 'var(--text3)' }}>还没有标注。输入类别后点「检测当前」，或在画布空白处拖拽手动画框。</div>}
        {anns.map((a, i) => (
          <div key={i} onClick={() => setSelectedIdx(i)} style={{ border: `1px solid ${i === selectedIdx ? 'var(--accent)' : 'var(--border-soft)'}`, borderRadius: 9, padding: '10px 11px', marginBottom: 8, background: 'var(--panel2)', cursor: 'pointer' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 7 }}>
              <span style={{ width: 9, height: 9, borderRadius: 2, background: colorOf(a.class_idx), flex: '0 0 9px' }} />
              <span style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>{nameOf(a.class_idx)}</span>
              {a.score != null && <span style={{ fontSize: 12, fontFamily: 'var(--mono)', color: 'var(--text2)' }}>{(a.score * 100).toFixed(0)}%</span>}
              <span style={{ fontSize: 10, color: a.source === 'auto' ? 'var(--blue)' : 'var(--text3)' }}>{a.source === 'auto' ? '自动' : '手动'}</span>
              <button onClick={(e) => { e.stopPropagation(); del(i) }} style={{ display: 'flex', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', padding: 0 }}><Icon name="trash" size={14} color="currentColor" /></button>
            </div>
            <div style={{ fontSize: 10.5, fontFamily: 'var(--mono)', color: 'var(--text3)' }}>{`[${a.x1.toFixed(0)}, ${a.y1.toFixed(0)}, ${a.x2.toFixed(0)}, ${a.y2.toFixed(0)}]`}</div>
          </div>
        ))}
      </div>
      <div style={{ borderTop: '1px solid var(--border-soft)', padding: '11px 13px' }}>
        <button onClick={() => goView('annotation')} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: 'var(--accent-ghost)', color: 'var(--accent)', border: '1px solid rgba(25,200,184,.3)', borderRadius: 8, padding: 9, fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
          <Icon name="anno" size={14} color="currentColor" />转入标注修正
        </button>
      </div>
    </>
  )
}

function VqaResults() {
  const activeImageId = useData((s) => s.activeImageId)
  const busy = useData((s) => s.busy)
  const inspections = useData((s) => s.inspections)
  const res = activeImageId ? inspections[activeImageId] : undefined
  const vmap: Record<string, [string, string, string]> = { 是: ['是', 'var(--green)', 'var(--green-g)'], 否: ['否', 'var(--red)', 'var(--red-g)'], 不确定: ['不确定', 'var(--amber)', 'var(--amber-g)'] }
  return (
    <>
      <div style={{ padding: '13px 15px', borderBottom: '1px solid var(--border-soft)' }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>巡检结论</div>
        <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>逐条判断 · 含依据{res ? ` · ${res.elapsed_ms}ms` : ''}</div>
      </div>
      <div style={{ padding: '11px 13px', borderBottom: '1px solid var(--border-soft)' }}>
        <textarea defaultValue={vqaState.q} onChange={(e) => { vqaState.q = e.target.value }} rows={3} placeholder="每行一个问题，如：航标是否损坏？"
          style={{ width: '100%', background: 'var(--panel2)', border: '1px solid var(--border)', borderRadius: 8, padding: 9, color: 'var(--text)', fontSize: 12.5, outline: 'none', resize: 'vertical' }} />
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 11 }}>
        {activeImageId && busy[activeImageId] && <div style={{ fontSize: 12.5, color: 'var(--text3)', padding: 8 }}>模型推理中…</div>}
        {!res && <div style={{ fontSize: 12.5, color: 'var(--text3)', padding: 8 }}>编辑问题后点「巡检当前」。</div>}
        {res?.answers.map((q, i) => {
          const [t, c, g] = vmap[q.answer] ?? vmap['不确定']
          return (
            <div key={i} style={{ background: 'var(--panel2)', borderRadius: 10, padding: 12, marginBottom: 9 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.4 }}>{q.question}</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: c, background: g, border: `1px solid ${c}55`, borderRadius: 7, padding: '4px 11px', whiteSpace: 'nowrap' }}>{t}</span>
              </div>
              {q.detail && <div style={{ fontSize: 11.5, lineHeight: 1.55, color: 'var(--text2)' }}>{q.detail}</div>}
            </div>
          )
        })}
      </div>
    </>
  )
}

function OcrResults() {
  const activeImageId = useData((s) => s.activeImageId)
  const busy = useData((s) => s.busy)
  const recognitions = useData((s) => s.recognitions)
  const [copied, setCopied] = useState(false)
  const res = activeImageId ? recognitions[activeImageId] : undefined
  const copy = () => { if (res?.text) { navigator.clipboard.writeText(res.text); setCopied(true); setTimeout(() => setCopied(false), 1500) } }
  return (
    <>
      <div style={{ padding: '13px 15px', borderBottom: '1px solid var(--border-soft)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600 }}>识别文本</div>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>可复制{res ? ` · ${res.elapsed_ms}ms` : ''}</div>
        </div>
        {res?.text && <button onClick={copy} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--accent)', background: 'var(--accent-ghost)', border: '1px solid rgba(25,200,184,.3)', borderRadius: 7, padding: '6px 10px', cursor: 'pointer' }}><Icon name="copy" size={13} color="currentColor" />{copied ? '已复制' : '复制全部'}</button>}
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 13 }}>
        {activeImageId && busy[activeImageId] && <div style={{ fontSize: 12.5, color: 'var(--text3)' }}>识别中…</div>}
        {!res && <div style={{ fontSize: 12.5, color: 'var(--text3)' }}>点「识别当前」用视觉模型读出图中文字。</div>}
        {res && (res.text ? <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 12.5, lineHeight: 1.6, fontFamily: 'var(--mono)', color: 'var(--text)' }}>{res.text}</pre> : <div style={{ fontSize: 12.5, color: 'var(--text3)' }}>未识别到文字。</div>)}
      </div>
    </>
  )
}

const selStyle = { background: 'var(--panel2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px', color: 'var(--text)', fontSize: 12.5, outline: 'none', cursor: 'pointer' } as const
const segStyle = (active: boolean) => ({ fontSize: 11.5, padding: '6px 12px', borderRadius: 6, cursor: 'pointer', border: 'none', background: active ? 'var(--accent-ghost)' : 'transparent', color: active ? 'var(--accent)' : 'var(--text2)', fontWeight: active ? 600 : 500 }) as const
