import { useCallback, useEffect, useRef } from 'react'
import { useStore, selectImages, selectClasses, selectActiveAnnotations } from '../store'
import { colorForIndex, withAlpha } from '../lib/colors'
import type { Annotation } from '../types'

type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'
const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']
const HANDLE_PX = 8
const MIN_BOX = 3 // 图像坐标下的最小边长

interface Box {
  x1: number
  y1: number
  x2: number
  y2: number
}

interface Interaction {
  type: 'idle' | 'draw' | 'move' | 'resize' | 'pan'
  annId?: string
  handle?: Handle
  startImg?: { x: number; y: number }
  startScreen?: { x: number; y: number }
  orig?: Box
  startView?: { scale: number; ox: number; oy: number }
  moveOffset?: { x: number; y: number }
}

function norm(b: Box): Box {
  return {
    x1: Math.min(b.x1, b.x2),
    y1: Math.min(b.y1, b.y2),
    x2: Math.max(b.x1, b.x2),
    y2: Math.max(b.y1, b.y2),
  }
}

export default function CanvasEditor() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef({ scale: 1, ox: 0, oy: 0 })
  const imgRef = useRef<HTMLImageElement | null>(null)
  const interRef = useRef<Interaction>({ type: 'idle' })
  const draftRef = useRef<Box | null>(null)
  const spaceRef = useRef(false)

  const image = useStore((s) => selectImages(s).find((i) => i.id === s.activeImageId) ?? null)
  const annotations = useStore(selectActiveAnnotations)
  const classes = useStore(selectClasses)
  const selectedAnnId = useStore((s) => s.selectedAnnId)

  const colorOf = useCallback(
    (classId: number) => classes.find((c) => c.id === classId)?.color ?? colorForIndex(classId),
    [classes],
  )
  const nameOf = useCallback(
    (classId: number) => classes.find((c) => c.id === classId)?.name ?? `#${classId}`,
    [classes],
  )

  // —— 坐标变换 ——
  const toScreen = (x: number, y: number) => {
    const v = viewRef.current
    return { x: x * v.scale + v.ox, y: y * v.scale + v.oy }
  }
  const toImage = (sx: number, sy: number) => {
    const v = viewRef.current
    return { x: (sx - v.ox) / v.scale, y: (sy - v.oy) / v.scale }
  }

  const fitToView = useCallback(() => {
    const img = imgRef.current
    const wrap = wrapRef.current
    if (!img || !wrap) return
    const cw = wrap.clientWidth
    const ch = wrap.clientHeight
    const pad = 24
    const scale = Math.min((cw - pad * 2) / img.width, (ch - pad * 2) / img.height)
    const s = scale > 0 && isFinite(scale) ? scale : 1
    viewRef.current = {
      scale: s,
      ox: (cw - img.width * s) / 2,
      oy: (ch - img.height * s) / 2,
    }
  }, [])

  // —— 绘制 ——
  const draw = useCallback(() => {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap) return
    const dpr = window.devicePixelRatio || 1
    const cw = wrap.clientWidth
    const ch = wrap.clientHeight
    if (canvas.width !== cw * dpr || canvas.height !== ch * dpr) {
      canvas.width = cw * dpr
      canvas.height = ch * dpr
      canvas.style.width = `${cw}px`
      canvas.style.height = `${ch}px`
    }
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, cw, ch)

    const img = imgRef.current
    if (!img) {
      ctx.fillStyle = '#64748b'
      ctx.font = '14px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('请选择左侧图片', cw / 2, ch / 2)
      return
    }

    const v = viewRef.current
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(img, v.ox, v.oy, img.width * v.scale, img.height * v.scale)

    const inter = interRef.current
    const drawBox = (b: Box, color: string, label: string, selected: boolean) => {
      const p1 = toScreen(b.x1, b.y1)
      const p2 = toScreen(b.x2, b.y2)
      const w = p2.x - p1.x
      const h = p2.y - p1.y
      ctx.lineWidth = selected ? 2.5 : 1.8
      ctx.strokeStyle = color
      ctx.fillStyle = withAlpha(color, selected ? 0.18 : 0.1)
      ctx.fillRect(p1.x, p1.y, w, h)
      ctx.strokeRect(p1.x, p1.y, w, h)
      // 标签
      if (label) {
        ctx.font = '12px sans-serif'
        const tw = ctx.measureText(label).width
        const lh = 16
        const ly = p1.y - lh >= 0 ? p1.y - lh : p1.y
        ctx.fillStyle = color
        ctx.fillRect(p1.x, ly, tw + 8, lh)
        ctx.fillStyle = '#fff'
        ctx.textAlign = 'left'
        ctx.textBaseline = 'middle'
        ctx.fillText(label, p1.x + 4, ly + lh / 2)
        ctx.textBaseline = 'alphabetic'
      }
    }

    for (const a of annotations) {
      const editing = inter.type !== 'idle' && inter.annId === a.id && draftRef.current
      const b = editing ? (draftRef.current as Box) : a
      drawBox(b, colorOf(a.classId), nameOf(a.classId), a.id === selectedAnnId)
    }

    // 正在绘制的新框
    if (inter.type === 'draw' && draftRef.current) {
      const activeClassId = useStore.getState().activeClassId
      const color = activeClassId != null ? colorOf(activeClassId) : '#3b82f6'
      drawBox(norm(draftRef.current), color, '', true)
    }

    // 选中框的 8 个控制点
    const sel = annotations.find((a) => a.id === selectedAnnId)
    if (sel) {
      const editing = inter.type !== 'idle' && inter.annId === sel.id && draftRef.current
      const b = norm(editing ? (draftRef.current as Box) : sel)
      ctx.fillStyle = '#fff'
      ctx.strokeStyle = '#0f172a'
      ctx.lineWidth = 1
      for (const hd of HANDLES) {
        const c = handleCenter(b, hd)
        const s = toScreen(c.x, c.y)
        ctx.fillRect(s.x - HANDLE_PX / 2, s.y - HANDLE_PX / 2, HANDLE_PX, HANDLE_PX)
        ctx.strokeRect(s.x - HANDLE_PX / 2, s.y - HANDLE_PX / 2, HANDLE_PX, HANDLE_PX)
      }
    }
  }, [annotations, colorOf, nameOf, selectedAnnId])

  // 每次相关状态变化后重绘
  useEffect(() => {
    draw()
  }, [draw])

  // 图片加载
  useEffect(() => {
    // 切图瞬间先清空当前图，避免用「旧图 + 旧变换」绘制新图的框（一帧错位）
    imgRef.current = null
    if (!image) {
      draw()
      return
    }
    draw() // 先画占位，等加载完成再画图
    const el = new Image()
    el.crossOrigin = 'anonymous'
    el.onload = () => {
      imgRef.current = el
      fitToView()
      draw()
    }
    el.onerror = () => {
      imgRef.current = null
      draw()
    }
    el.src = image.url
    return () => {
      el.onload = null
      el.onerror = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [image?.id, image?.url])

  // 容器尺寸变化：重新适配窗口，避免图片漂移到画布外
  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    const ro = new ResizeObserver(() => {
      fitToView()
      draw()
    })
    ro.observe(wrap)
    return () => ro.disconnect()
  }, [draw, fitToView])

  // 键盘：删除 / 取消
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space') spaceRef.current = true
      const st = useStore.getState()
      const target = e.target as HTMLElement | null
      const typing = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')
      if (typing) return
      if ((e.key === 'Delete' || e.key === 'Backspace') && st.selectedAnnId && st.activeImageId) {
        e.preventDefault()
        st.removeAnnotation(st.activeImageId, st.selectedAnnId)
      } else if (e.key === 'Escape') {
        interRef.current = { type: 'idle' }
        draftRef.current = null
        st.setSelected(null)
        draw()
      }
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') spaceRef.current = false
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [draw])

  // —— 命中测试 ——
  const hitHandle = (sx: number, sy: number, b: Box): Handle | null => {
    for (const hd of HANDLES) {
      const c = handleCenter(norm(b), hd)
      const s = toScreen(c.x, c.y)
      if (Math.abs(sx - s.x) <= HANDLE_PX && Math.abs(sy - s.y) <= HANDLE_PX) return hd
    }
    return null
  }
  const hitBox = (ix: number, iy: number): Annotation | null => {
    for (let i = annotations.length - 1; i >= 0; i--) {
      const a = annotations[i]
      const b = norm(a)
      if (ix >= b.x1 && ix <= b.x2 && iy >= b.y1 && iy <= b.y2) return a
    }
    return null
  }

  // —— 指针事件 ——
  const localPoint = (e: React.PointerEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    return { sx: e.clientX - rect.left, sy: e.clientY - rect.top }
  }

  const onPointerDown = (e: React.PointerEvent) => {
    canvasRef.current?.setPointerCapture(e.pointerId)
    const { sx, sy } = localPoint(e)
    const img = imgRef.current
    if (!img) return
    const v = viewRef.current
    const st = useStore.getState()

    // 平移：空格 或 中键
    if (spaceRef.current || e.button === 1) {
      interRef.current = {
        type: 'pan',
        startScreen: { x: sx, y: sy },
        startView: { ...v },
      }
      return
    }
    if (e.button !== 0) return

    const ip = toImage(sx, sy)
    const sel = annotations.find((a) => a.id === selectedAnnId)

    // 1) 选中框的控制点 → resize
    if (sel) {
      const hd = hitHandle(sx, sy, sel)
      if (hd) {
        draftRef.current = { x1: sel.x1, y1: sel.y1, x2: sel.x2, y2: sel.y2 }
        interRef.current = { type: 'resize', annId: sel.id, handle: hd, orig: norm(sel) }
        return
      }
    }

    // 2) 点到某个框 → 选中并移动
    const hb = hitBox(ip.x, ip.y)
    if (hb) {
      st.setSelected(hb.id)
      const nb = norm(hb)
      draftRef.current = { ...nb }
      interRef.current = {
        type: 'move',
        annId: hb.id,
        orig: nb,
        startImg: ip,
        moveOffset: { x: ip.x - nb.x1, y: ip.y - nb.y1 },
      }
      draw()
      return
    }

    // 3) 空白处 → 画新框
    st.setSelected(null)
    draftRef.current = { x1: ip.x, y1: ip.y, x2: ip.x, y2: ip.y }
    interRef.current = { type: 'draw', startImg: ip }
    draw()
  }

  const clampToImage = (b: Box): Box => {
    const img = imgRef.current!
    return {
      x1: Math.max(0, Math.min(b.x1, img.width)),
      y1: Math.max(0, Math.min(b.y1, img.height)),
      x2: Math.max(0, Math.min(b.x2, img.width)),
      y2: Math.max(0, Math.min(b.y2, img.height)),
    }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const { sx, sy } = localPoint(e)
    const inter = interRef.current
    const img = imgRef.current
    if (!img) return
    const canvas = canvasRef.current!

    if (inter.type === 'idle') {
      // 悬停光标
      const ip = toImage(sx, sy)
      const sel = annotations.find((a) => a.id === selectedAnnId)
      let cursor = spaceRef.current ? 'grab' : 'crosshair'
      if (sel) {
        const hd = hitHandle(sx, sy, sel)
        if (hd) cursor = handleCursor(hd)
        else if (hitBox(ip.x, ip.y)) cursor = 'move'
      } else if (hitBox(ip.x, ip.y)) {
        cursor = 'move'
      }
      canvas.style.cursor = cursor
      return
    }

    if (inter.type === 'pan' && inter.startScreen && inter.startView) {
      viewRef.current = {
        scale: inter.startView.scale,
        ox: inter.startView.ox + (sx - inter.startScreen.x),
        oy: inter.startView.oy + (sy - inter.startScreen.y),
      }
      canvas.style.cursor = 'grabbing'
      draw()
      return
    }

    const ip = toImage(sx, sy)

    if (inter.type === 'draw' && draftRef.current) {
      draftRef.current = { ...draftRef.current, x2: ip.x, y2: ip.y }
      draw()
      return
    }

    if (inter.type === 'move' && inter.orig && inter.moveOffset) {
      const w = inter.orig.x2 - inter.orig.x1
      const h = inter.orig.y2 - inter.orig.y1
      let x1 = ip.x - inter.moveOffset.x
      let y1 = ip.y - inter.moveOffset.y
      x1 = Math.max(0, Math.min(x1, img.width - w))
      y1 = Math.max(0, Math.min(y1, img.height - h))
      draftRef.current = { x1, y1, x2: x1 + w, y2: y1 + h }
      draw()
      return
    }

    if (inter.type === 'resize' && inter.orig && inter.handle) {
      let hd = inter.handle
      const o = inter.orig
      const b: Box = { x1: o.x1, y1: o.y1, x2: o.x2, y2: o.y2 }
      if (hd.includes('w')) b.x1 = ip.x
      if (hd.includes('e')) b.x2 = ip.x
      if (hd.includes('n')) b.y1 = ip.y
      if (hd.includes('s')) b.y2 = ip.y
      // 拖过对边时：交换锚点并镜像手柄方向，让控制点继续跟随光标
      if (b.x1 > b.x2) {
        const anchorX = hd.includes('e') ? o.x1 : o.x2
        o.x1 = anchorX
        o.x2 = anchorX
        hd = hd.replace('w', '#').replace('e', 'w').replace('#', 'e') as Handle
        ;[b.x1, b.x2] = [b.x2, b.x1]
      }
      if (b.y1 > b.y2) {
        const anchorY = hd.includes('s') ? o.y1 : o.y2
        o.y1 = anchorY
        o.y2 = anchorY
        hd = hd.replace('n', '#').replace('s', 'n').replace('#', 's') as Handle
        ;[b.y1, b.y2] = [b.y2, b.y1]
      }
      inter.handle = hd
      draftRef.current = clampToImage(b)
      draw()
      return
    }
  }

  const onPointerUp = (e: React.PointerEvent) => {
    canvasRef.current?.releasePointerCapture(e.pointerId)
    const inter = interRef.current
    const st = useStore.getState()
    const imageId = st.activeImageId
    const draft = draftRef.current

    if (inter.type === 'draw' && draft && imageId) {
      const b = clampToImage(norm(draft))
      if (b.x2 - b.x1 >= MIN_BOX && b.y2 - b.y1 >= MIN_BOX) {
        let classId = st.activeClassId
        if (classId == null) classId = st.ensureClass('object')
        const id = st.addAnnotation(imageId, {
          classId,
          x1: b.x1,
          y1: b.y1,
          x2: b.x2,
          y2: b.y2,
          source: 'manual',
          score: null,
        })
        st.setSelected(id)
      }
    } else if ((inter.type === 'move' || inter.type === 'resize') && draft && imageId && inter.annId) {
      const b = clampToImage(norm(draft))
      if (b.x2 - b.x1 >= MIN_BOX && b.y2 - b.y1 >= MIN_BOX) {
        st.updateAnnotation(imageId, inter.annId, { x1: b.x1, y1: b.y1, x2: b.x2, y2: b.y2 })
      }
    }

    draftRef.current = null
    interRef.current = { type: 'idle' }
    draw()
  }

  const onWheel = (e: React.WheelEvent) => {
    if (!imgRef.current) return
    const { sx, sy } = { sx: e.nativeEvent.offsetX, sy: e.nativeEvent.offsetY }
    const before = toImage(sx, sy)
    const v = viewRef.current
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1
    const scale = Math.max(0.05, Math.min(20, v.scale * factor))
    viewRef.current = {
      scale,
      ox: sx - before.x * scale,
      oy: sy - before.y * scale,
    }
    draw()
  }

  const resetView = () => {
    fitToView()
    draw()
  }

  return (
    <div ref={wrapRef} className="relative h-full w-full overflow-hidden bg-slate-900">
      <canvas
        ref={canvasRef}
        className="block touch-none select-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        onWheel={onWheel}
        onContextMenu={(e) => e.preventDefault()}
      />
      <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/55 px-3 py-1 text-xs text-slate-200">
        滚轮缩放 · 空格/中键拖动 · 空白处拖拽画框 · Del 删除
      </div>
      <button
        onClick={resetView}
        className="absolute bottom-3 right-3 rounded-md bg-slate-700/80 px-3 py-1 text-xs text-white hover:bg-slate-600"
      >
        适配窗口
      </button>
    </div>
  )
}

function handleCenter(b: Box, hd: Handle): { x: number; y: number } {
  const cx = (b.x1 + b.x2) / 2
  const cy = (b.y1 + b.y2) / 2
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
  switch (hd) {
    case 'nw':
    case 'se':
      return 'nwse-resize'
    case 'ne':
    case 'sw':
      return 'nesw-resize'
    case 'n':
    case 's':
      return 'ns-resize'
    case 'e':
    case 'w':
      return 'ew-resize'
  }
}
