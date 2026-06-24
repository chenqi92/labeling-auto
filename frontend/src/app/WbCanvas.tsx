/** 工作台画布：图片 + 标注框，支持缩放/平移/画框/移动/缩放/删除。
 *  标注以 dataStore 为真源，每次编辑完成后整图 PUT 落库（saveAnnotations）。
 *  逻辑移植自旧 CanvasEditor，适配后端 Ann(class_idx) 模型 + 按序号选中。 */
import { useCallback, useEffect, useRef } from 'react'
import { selActiveAnns, selActiveImage, useData } from '../dataStore'
import { colorForIndex, withAlpha } from '../lib/colors'
import type { Ann } from '../types'

type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'
const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']
const HANDLE_PX = 8
const MIN_BOX = 3

interface Box { x1: number; y1: number; x2: number; y2: number }
interface Interaction {
  type: 'idle' | 'draw' | 'move' | 'resize' | 'pan'
  idx?: number
  handle?: Handle
  startScreen?: { x: number; y: number }
  orig?: Box
  startView?: { scale: number; ox: number; oy: number }
  moveOffset?: { x: number; y: number }
}
const norm = (b: Box): Box => ({ x1: Math.min(b.x1, b.x2), y1: Math.min(b.y1, b.y2), x2: Math.max(b.x1, b.x2), y2: Math.max(b.y1, b.y2) })

export default function WbCanvas({ readOnly = false }: { readOnly?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef({ scale: 1, ox: 0, oy: 0 })
  const imgRef = useRef<HTMLImageElement | null>(null)
  const interRef = useRef<Interaction>({ type: 'idle' })
  const draftRef = useRef<Box | null>(null)
  const spaceRef = useRef(false)

  const image = useData(selActiveImage)
  const annotations = useData(selActiveAnns)
  const classes = useData((s) => s.classes)
  const selectedIdx = useData((s) => s.selectedIdx)

  const colorOf = useCallback((ci: number) => classes.find((c) => c.id === ci)?.color ?? colorForIndex(ci), [classes])
  const nameOf = useCallback((ci: number) => classes.find((c) => c.id === ci)?.name ?? `#${ci}`, [classes])

  const toScreen = (x: number, y: number) => { const v = viewRef.current; return { x: x * v.scale + v.ox, y: y * v.scale + v.oy } }
  const toImage = (sx: number, sy: number) => { const v = viewRef.current; return { x: (sx - v.ox) / v.scale, y: (sy - v.oy) / v.scale } }

  const fitToView = useCallback(() => {
    const img = imgRef.current, wrap = wrapRef.current
    if (!img || !wrap) return
    const cw = wrap.clientWidth, ch = wrap.clientHeight, pad = 24
    const scale = Math.min((cw - pad * 2) / img.width, (ch - pad * 2) / img.height)
    const s = scale > 0 && isFinite(scale) ? scale : 1
    viewRef.current = { scale: s, ox: (cw - img.width * s) / 2, oy: (ch - img.height * s) / 2 }
  }, [])

  const draw = useCallback(() => {
    const canvas = canvasRef.current, wrap = wrapRef.current
    if (!canvas || !wrap) return
    const dpr = window.devicePixelRatio || 1
    const cw = wrap.clientWidth, ch = wrap.clientHeight
    if (canvas.width !== cw * dpr || canvas.height !== ch * dpr) {
      canvas.width = cw * dpr; canvas.height = ch * dpr; canvas.style.width = `${cw}px`; canvas.style.height = `${ch}px`
    }
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, cw, ch)
    const img = imgRef.current
    if (!img) {
      ctx.fillStyle = '#69737f'; ctx.font = '13px sans-serif'; ctx.textAlign = 'center'
      ctx.fillText(image ? '加载中…' : '请选择左侧图片', cw / 2, ch / 2)
      return
    }
    const v = viewRef.current
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(img, v.ox, v.oy, img.width * v.scale, img.height * v.scale)
    const inter = interRef.current

    const drawBox = (b: Box, color: string, label: string, selected: boolean) => {
      const p1 = toScreen(b.x1, b.y1), p2 = toScreen(b.x2, b.y2)
      ctx.lineWidth = selected ? 2.5 : 1.8
      ctx.strokeStyle = color
      ctx.fillStyle = withAlpha(color, selected ? 0.18 : 0.1)
      ctx.fillRect(p1.x, p1.y, p2.x - p1.x, p2.y - p1.y)
      ctx.strokeRect(p1.x, p1.y, p2.x - p1.x, p2.y - p1.y)
      if (label) {
        ctx.font = '12px sans-serif'
        const tw = ctx.measureText(label).width, lh = 16
        const ly = p1.y - lh >= 0 ? p1.y - lh : p1.y
        ctx.fillStyle = color
        ctx.fillRect(p1.x, ly, tw + 8, lh)
        ctx.fillStyle = '#04140f'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
        ctx.fillText(label, p1.x + 4, ly + lh / 2); ctx.textBaseline = 'alphabetic'
      }
    }

    annotations.forEach((a, i) => {
      const editing = inter.type !== 'idle' && inter.idx === i && draftRef.current
      const b = editing ? (draftRef.current as Box) : a
      const label = a.score != null ? `${nameOf(a.class_idx)} ${(a.score * 100).toFixed(0)}%` : nameOf(a.class_idx)
      drawBox(b, colorOf(a.class_idx), label, i === selectedIdx)
    })

    if (inter.type === 'draw' && draftRef.current) {
      const acid = useData.getState().activeClassId
      drawBox(norm(draftRef.current), acid != null ? colorOf(acid) : '#19c8b8', '', true)
    }

    if (selectedIdx != null && annotations[selectedIdx]) {
      const editing = inter.type !== 'idle' && inter.idx === selectedIdx && draftRef.current
      const b = norm(editing ? (draftRef.current as Box) : annotations[selectedIdx])
      ctx.fillStyle = '#fff'; ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 1
      for (const hd of HANDLES) {
        const c = handleCenter(b, hd)
        const s = toScreen(c.x, c.y)
        ctx.fillRect(s.x - HANDLE_PX / 2, s.y - HANDLE_PX / 2, HANDLE_PX, HANDLE_PX)
        ctx.strokeRect(s.x - HANDLE_PX / 2, s.y - HANDLE_PX / 2, HANDLE_PX, HANDLE_PX)
      }
    }
  }, [annotations, classes, colorOf, nameOf, selectedIdx, image])

  useEffect(() => { draw() }, [draw])

  useEffect(() => {
    imgRef.current = null
    if (!image) { draw(); return }
    draw()
    const el = new Image()
    el.crossOrigin = 'anonymous'
    el.onload = () => { imgRef.current = el; fitToView(); draw() }
    el.onerror = () => { imgRef.current = null; draw() }
    el.src = image.url
    return () => { el.onload = null; el.onerror = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [image?.id, image?.url])

  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    const ro = new ResizeObserver(() => { fitToView(); draw() })
    ro.observe(wrap)
    return () => ro.disconnect()
  }, [draw, fitToView])

  // 持久化整图标注
  const persist = (list: Ann[]) => {
    const iid = useData.getState().activeImageId
    if (iid) useData.getState().saveAnnotations(iid, list)
  }

  useEffect(() => {
    if (readOnly) return
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space') spaceRef.current = true
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return
      const st = useData.getState()
      if ((e.key === 'Delete' || e.key === 'Backspace') && st.selectedIdx != null && st.activeImageId) {
        e.preventDefault()
        const cur = st.anns[st.activeImageId] ?? []
        persist(cur.filter((_, i) => i !== st.selectedIdx))
        st.setSelectedIdx(null)
      } else if (e.key === 'Escape') {
        interRef.current = { type: 'idle' }; draftRef.current = null
        st.setSelectedIdx(null); draw()
      }
    }
    const onKeyUp = (e: KeyboardEvent) => { if (e.code === 'Space') spaceRef.current = false }
    window.addEventListener('keydown', onKey); window.addEventListener('keyup', onKeyUp)
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('keyup', onKeyUp) }
  }, [draw, readOnly])

  const hitHandle = (sx: number, sy: number, b: Box): Handle | null => {
    for (const hd of HANDLES) {
      const c = handleCenter(norm(b), hd); const s = toScreen(c.x, c.y)
      if (Math.abs(sx - s.x) <= HANDLE_PX && Math.abs(sy - s.y) <= HANDLE_PX) return hd
    }
    return null
  }
  const hitBoxIdx = (ix: number, iy: number): number | null => {
    for (let i = annotations.length - 1; i >= 0; i--) {
      const b = norm(annotations[i])
      if (ix >= b.x1 && ix <= b.x2 && iy >= b.y1 && iy <= b.y2) return i
    }
    return null
  }
  const localPoint = (e: React.PointerEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    return { sx: e.clientX - rect.left, sy: e.clientY - rect.top }
  }
  const clampToImage = (b: Box): Box => {
    const img = imgRef.current!
    return {
      x1: Math.max(0, Math.min(b.x1, img.width)), y1: Math.max(0, Math.min(b.y1, img.height)),
      x2: Math.max(0, Math.min(b.x2, img.width)), y2: Math.max(0, Math.min(b.y2, img.height)),
    }
  }

  const onPointerDown = (e: React.PointerEvent) => {
    canvasRef.current?.setPointerCapture(e.pointerId)
    const { sx, sy } = localPoint(e)
    if (!imgRef.current) return
    const v = viewRef.current
    const st = useData.getState()
    if (spaceRef.current || e.button === 1) {
      interRef.current = { type: 'pan', startScreen: { x: sx, y: sy }, startView: { ...v } }
      return
    }
    if (e.button !== 0 || readOnly) return
    const ip = toImage(sx, sy)
    if (selectedIdx != null && annotations[selectedIdx]) {
      const hd = hitHandle(sx, sy, annotations[selectedIdx])
      if (hd) { draftRef.current = norm(annotations[selectedIdx]); interRef.current = { type: 'resize', idx: selectedIdx, handle: hd, orig: norm(annotations[selectedIdx]) }; return }
    }
    const hi = hitBoxIdx(ip.x, ip.y)
    if (hi != null) {
      st.setSelectedIdx(hi)
      const nb = norm(annotations[hi])
      draftRef.current = { ...nb }
      interRef.current = { type: 'move', idx: hi, orig: nb, moveOffset: { x: ip.x - nb.x1, y: ip.y - nb.y1 } }
      draw(); return
    }
    st.setSelectedIdx(null)
    draftRef.current = { x1: ip.x, y1: ip.y, x2: ip.x, y2: ip.y }
    interRef.current = { type: 'draw' }
    draw()
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const { sx, sy } = localPoint(e)
    const inter = interRef.current
    const img = imgRef.current
    if (!img) return
    const canvas = canvasRef.current!
    if (inter.type === 'idle') {
      const ip = toImage(sx, sy)
      let cursor = spaceRef.current ? 'grab' : readOnly ? 'default' : 'crosshair'
      if (!readOnly && selectedIdx != null && annotations[selectedIdx]) {
        const hd = hitHandle(sx, sy, annotations[selectedIdx])
        if (hd) cursor = handleCursor(hd); else if (hitBoxIdx(ip.x, ip.y) != null) cursor = 'move'
      } else if (!readOnly && hitBoxIdx(ip.x, ip.y) != null) cursor = 'move'
      canvas.style.cursor = cursor
      return
    }
    if (inter.type === 'pan' && inter.startScreen && inter.startView) {
      viewRef.current = { scale: inter.startView.scale, ox: inter.startView.ox + (sx - inter.startScreen.x), oy: inter.startView.oy + (sy - inter.startScreen.y) }
      canvas.style.cursor = 'grabbing'; draw(); return
    }
    const ip = toImage(sx, sy)
    if (inter.type === 'draw' && draftRef.current) { draftRef.current = { ...draftRef.current, x2: ip.x, y2: ip.y }; draw(); return }
    if (inter.type === 'move' && inter.orig && inter.moveOffset) {
      const w = inter.orig.x2 - inter.orig.x1, h = inter.orig.y2 - inter.orig.y1
      let x1 = ip.x - inter.moveOffset.x, y1 = ip.y - inter.moveOffset.y
      x1 = Math.max(0, Math.min(x1, img.width - w)); y1 = Math.max(0, Math.min(y1, img.height - h))
      draftRef.current = { x1, y1, x2: x1 + w, y2: y1 + h }; draw(); return
    }
    if (inter.type === 'resize' && inter.orig && inter.handle) {
      let hd = inter.handle
      const o = inter.orig
      const b: Box = { ...o }
      if (hd.includes('w')) b.x1 = ip.x
      if (hd.includes('e')) b.x2 = ip.x
      if (hd.includes('n')) b.y1 = ip.y
      if (hd.includes('s')) b.y2 = ip.y
      if (b.x1 > b.x2) { const ax = hd.includes('e') ? o.x1 : o.x2; o.x1 = ax; o.x2 = ax; hd = hd.replace('w', '#').replace('e', 'w').replace('#', 'e') as Handle;[b.x1, b.x2] = [b.x2, b.x1] }
      if (b.y1 > b.y2) { const ay = hd.includes('s') ? o.y1 : o.y2; o.y1 = ay; o.y2 = ay; hd = hd.replace('n', '#').replace('s', 'n').replace('#', 's') as Handle;[b.y1, b.y2] = [b.y2, b.y1] }
      inter.handle = hd
      draftRef.current = clampToImage(b); draw(); return
    }
  }

  const onPointerUp = (e: React.PointerEvent) => {
    canvasRef.current?.releasePointerCapture(e.pointerId)
    const inter = interRef.current
    const st = useData.getState()
    const iid = st.activeImageId
    const draft = draftRef.current
    const cur = (iid && st.anns[iid]) || []
    if (inter.type === 'draw' && draft && iid) {
      const b = clampToImage(norm(draft))
      if (b.x2 - b.x1 >= MIN_BOX && b.y2 - b.y1 >= MIN_BOX) {
        void commitNewBox(b, cur)
      }
    } else if ((inter.type === 'move' || inter.type === 'resize') && draft && iid && inter.idx != null) {
      const b = clampToImage(norm(draft))
      if (b.x2 - b.x1 >= MIN_BOX && b.y2 - b.y1 >= MIN_BOX) {
        const next = cur.map((a, i) => (i === inter.idx ? { ...a, x1: b.x1, y1: b.y1, x2: b.x2, y2: b.y2 } : a))
        persist(next)
      }
    }
    draftRef.current = null; interRef.current = { type: 'idle' }; draw()
  }

  // 新框：确保有类别后落库
  const commitNewBox = async (b: Box, cur: Ann[]) => {
    const st = useData.getState()
    let classId = st.activeClassId ?? st.classes[0]?.id ?? null
    if (classId == null) {
      const c = await st.addClass('object')
      classId = c?.id ?? 0
      st.setActiveClassId(classId)
    }
    const next: Ann[] = [...cur, { class_idx: classId, x1: b.x1, y1: b.y1, x2: b.x2, y2: b.y2, score: null, source: 'manual' }]
    await st.saveAnnotations(st.activeImageId!, next)
    st.setSelectedIdx(next.length - 1)
  }

  const onWheel = (e: React.WheelEvent) => {
    if (!imgRef.current) return
    const sx = e.nativeEvent.offsetX, sy = e.nativeEvent.offsetY
    const before = toImage(sx, sy)
    const v = viewRef.current
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1
    const scale = Math.max(0.05, Math.min(20, v.scale * factor))
    viewRef.current = { scale, ox: sx - before.x * scale, oy: sy - before.y * scale }
    draw()
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative', height: '100%', width: '100%', overflow: 'hidden', background: 'var(--canvas)', backgroundImage: 'linear-gradient(var(--gridfine) 1px,transparent 1px),linear-gradient(90deg,var(--gridfine) 1px,transparent 1px)', backgroundSize: '36px 36px' }}>
      <canvas ref={canvasRef} style={{ display: 'block', touchAction: 'none', userSelect: 'none' }}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerLeave={onPointerUp}
        onWheel={onWheel} onContextMenu={(e) => e.preventDefault()} />
      {image && (
        <>
          <div style={{ position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)', pointerEvents: 'none', background: 'rgba(0,0,0,.55)', borderRadius: 20, padding: '5px 13px', fontSize: 11, color: 'rgba(255,255,255,.85)' }}>
            {readOnly ? '滚轮缩放 · 空格/中键拖动' : '滚轮缩放 · 空格/中键拖动 · 空白拖拽画框 · Del 删除'}
          </div>
          <button onClick={() => { fitToView(); draw() }} style={{ position: 'absolute', bottom: 12, right: 12, background: 'rgba(0,0,0,.45)', border: '1px solid rgba(255,255,255,.12)', borderRadius: 7, color: '#fff', cursor: 'pointer', padding: '5px 10px', fontSize: 11 }}>适配窗口</button>
        </>
      )}
    </div>
  )
}

function handleCenter(b: Box, hd: Handle): { x: number; y: number } {
  const cx = (b.x1 + b.x2) / 2, cy = (b.y1 + b.y2) / 2
  switch (hd) {
    case 'nw': return { x: b.x1, y: b.y1 }
    case 'n': return { x: cx, y: b.y1 }
    case 'ne': return { x: b.x2, y: b.y1 }
    case 'e': return { x: b.x2, y: cy }
    case 'se': return { x: b.x2, y: b.y2 }
    case 's': return { x: cx, y: b.y2 }
    case 'sw': return { x: b.x1, y: b.y2 }
    case 'w': return { x: b.x1, y: cy }
  }
}
function handleCursor(hd: Handle): string {
  if (hd === 'nw' || hd === 'se') return 'nwse-resize'
  if (hd === 'ne' || hd === 'sw') return 'nesw-resize'
  if (hd === 'n' || hd === 's') return 'ns-resize'
  return 'ew-resize'
}
