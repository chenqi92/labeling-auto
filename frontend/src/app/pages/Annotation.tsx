/** 数据标注工作台：图片列表 + 画布(矩形框) + 类别集 + 实例列表 + 自动预标注 + 导出。 */
import { useState } from 'react'
import { selActiveAnns, selProject, useData } from '../../dataStore'
import { detect } from '../../api'
import { downloadBlob, exportProject } from '../../api2'
import WbCanvas from '../WbCanvas'
import { Icon } from '../ui'

export default function Annotation() {
  const images = useData((s) => s.images)
  const activeImageId = useData((s) => s.activeImageId)
  const classes = useData((s) => s.classes)
  const activeClassId = useData((s) => s.activeClassId)
  const anns = useData(selActiveAnns)
  const selectedIdx = useData((s) => s.selectedIdx)
  const project = useData(selProject)
  const setActiveImage = useData((s) => s.setActiveImage)
  const setActiveClassId = useData((s) => s.setActiveClassId)
  const setSelectedIdx = useData((s) => s.setSelectedIdx)
  const addClass = useData((s) => s.addClass)
  const removeClass = useData((s) => s.removeClass)
  const saveAnnotations = useData((s) => s.saveAnnotations)
  const applyDetections = useData((s) => s.applyDetections)
  const setBusy = useData((s) => s.setBusy)

  const [newClass, setNewClass] = useState('')
  const [prelabeling, setPrelabeling] = useState(false)

  const nameOf = (ci: number) => classes.find((c) => c.id === ci)?.name ?? `#${ci}`
  const colorOf = (ci: number) => classes.find((c) => c.id === ci)?.color ?? '#3d8bff'

  const prelabel = async () => {
    if (!activeImageId) return
    const q = classes.map((c) => c.name).join(' ').trim()
    if (!q) { alert('先在右侧添加至少一个类别，自动预标注按类别名检测'); return }
    setPrelabeling(true); setBusy(activeImageId, true)
    try {
      const res = await detect({ image_id: activeImageId, query: q, task: 'detection', engine: 'la' })
      await applyDetections(activeImageId, res.boxes)
    } catch (e) { alert(`预标注失败：${(e as Error).message}`) } finally { setPrelabeling(false); setBusy(activeImageId, false) }
  }

  const doExport = async (fmt: 'yolo' | 'coco') => {
    if (!project) return
    try { downloadBlob(await exportProject(project.id, fmt), `${project.name}-${fmt}.zip`) }
    catch (e) { alert((e as Error).message) }
  }

  const reassign = (i: number, ci: number) => {
    if (!activeImageId) return
    saveAnnotations(activeImageId, anns.map((a, k) => (k === i ? { ...a, class_idx: ci } : a)))
  }
  const del = (i: number) => { if (activeImageId) saveAnnotations(activeImageId, anns.filter((_, k) => k !== i)) }

  const KEYS: [string, string][] = [['滚轮', '缩放'], ['空格', '平移'], ['拖拽', '画框'], ['Del', '删除'], ['Esc', '取消']]

  return (
    <div style={{ height: '100%', display: 'flex', minWidth: 0 }}>
      {/* 左：图片 */}
      <div style={{ width: 170, flex: '0 0 170px', background: 'var(--chrome)', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '12px 12px 9px', fontSize: 12, fontWeight: 600, borderBottom: '1px solid var(--border-soft)' }}>素材 · {images.length}</div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 9 }}>
          {images.map((im) => (
            <div key={im.id} onClick={() => setActiveImage(im.id)} style={{ position: 'relative', borderRadius: 7, overflow: 'hidden', marginBottom: 7, cursor: 'pointer', border: `2px solid ${im.id === activeImageId ? 'var(--accent)' : 'transparent'}` }}>
              <img src={im.url} alt={im.filename} style={{ width: '100%', height: 50, objectFit: 'cover', display: 'block' }} />
              <span style={{ position: 'absolute', top: 4, right: 4, width: 7, height: 7, borderRadius: '50%', background: im.status === 'done' ? 'var(--green)' : 'var(--text3)' }} />
            </div>
          ))}
        </div>
      </div>
      {/* 中：画布 */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: '0 0 auto', borderBottom: '1px solid var(--border)', background: 'var(--chrome)', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px' }}>
          <button onClick={prelabel} disabled={prelabeling || !activeImageId} style={{ display: 'flex', alignItems: 'center', gap: 7, background: 'var(--accent)', color: '#04140f', border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 600, cursor: prelabeling ? 'wait' : 'pointer' }}>
            <Icon name="train" size={14} color="currentColor" />{prelabeling ? '预标注中…' : '自动预标注'}
          </button>
          <span style={{ fontSize: 11, color: 'var(--text3)' }}>用检测模型先标一遍，人只做修正</span>
          <div style={{ flex: 1 }} />
          <button onClick={() => doExport('yolo')} style={tb}>导出 YOLO</button>
          <button onClick={() => doExport('coco')} style={tb}>导出 COCO</button>
        </div>
        <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
          {activeImageId ? <WbCanvas /> : <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text3)', fontSize: 13, background: 'var(--canvas)' }}>选择左侧图片开始标注</div>}
        </div>
        <div style={{ flex: '0 0 auto', borderTop: '1px solid var(--border)', background: 'var(--chrome)', display: 'flex', gap: 18, padding: '9px 16px', fontSize: 11, color: 'var(--text3)' }}>
          {KEYS.map(([k, l]) => <span key={k} style={{ display: 'flex', alignItems: 'center', gap: 6 }}><kbd style={{ fontFamily: 'var(--mono)', fontSize: 10.5, background: 'var(--panel2)', border: '1px solid var(--border)', borderRadius: 4, padding: '2px 6px', color: 'var(--text2)' }}>{k}</kbd>{l}</span>)}
        </div>
      </div>
      {/* 右：类别 + 实例 */}
      <div style={{ width: 270, flex: '0 0 270px', background: 'var(--chrome)', borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div style={{ padding: '13px 14px', borderBottom: '1px solid var(--border-soft)' }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 9 }}>类别集 · 新框归入高亮类</div>
          {classes.map((c) => (
            <div key={c.id} onClick={() => setActiveClassId(c.id)} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '7px 9px', borderRadius: 7, marginBottom: 5, cursor: 'pointer', background: c.id === activeClassId ? 'var(--accent-ghost)' : 'var(--panel2)', border: `1px solid ${c.id === activeClassId ? 'rgba(25,200,184,.3)' : 'transparent'}` }}>
              <span style={{ width: 12, height: 12, borderRadius: 3, background: c.color }} />
              <span style={{ flex: 1, fontSize: 12.5 }}>{c.name}</span>
              <button onClick={(e) => { e.stopPropagation(); if (confirm(`删除类别「${c.name}」及其标注？`)) removeClass(c.id) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', display: 'flex' }}><Icon name="trash" size={13} color="currentColor" /></button>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
            <input value={newClass} onChange={(e) => setNewClass(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && newClass.trim()) { addClass(newClass.trim()); setNewClass('') } }} placeholder="新建类别名" style={{ flex: 1, background: 'var(--panel2)', border: '1px solid var(--border)', borderRadius: 7, padding: '7px 9px', color: 'var(--text)', fontSize: 12, outline: 'none' }} />
            <button onClick={() => { if (newClass.trim()) { addClass(newClass.trim()); setNewClass('') } }} style={{ background: 'var(--accent-ghost)', color: 'var(--accent)', border: 'none', borderRadius: 7, padding: '0 11px', cursor: 'pointer', fontSize: 16 }}>+</button>
          </div>
        </div>
        <div style={{ padding: '11px 14px 7px', fontSize: 12, color: 'var(--text3)' }}>当前图 · {anns.length} 个实例</div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 10px 10px' }}>
          {anns.map((a, i) => (
            <div key={i} onClick={() => setSelectedIdx(i)} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 10px', background: i === selectedIdx ? 'var(--accent-ghost)' : 'var(--panel2)', border: `1px solid ${i === selectedIdx ? 'var(--accent)' : 'transparent'}`, borderRadius: 8, marginBottom: 6, cursor: 'pointer' }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: colorOf(a.class_idx) }} />
              <select value={a.class_idx} onClick={(e) => e.stopPropagation()} onChange={(e) => reassign(i, parseInt(e.target.value))} style={{ flex: 1, background: 'transparent', border: 'none', color: 'var(--text)', fontSize: 12.5, outline: 'none', cursor: 'pointer' }}>
                {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                {!classes.find((c) => c.id === a.class_idx) && <option value={a.class_idx}>{nameOf(a.class_idx)}</option>}
              </select>
              <span style={{ fontSize: 10, color: a.source === 'auto' ? 'var(--blue)' : 'var(--text3)' }}>{a.source === 'auto' ? '自动' : '手动'}</span>
              <button onClick={(e) => { e.stopPropagation(); del(i) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', display: 'flex' }}><Icon name="trash" size={13} color="currentColor" /></button>
            </div>
          ))}
          {anns.length === 0 && <div style={{ fontSize: 12, color: 'var(--text3)', padding: 10 }}>空白处拖拽画框，或点「自动预标注」。</div>}
        </div>
      </div>
    </div>
  )
}

const tb = { fontSize: 12, background: 'var(--panel2)', border: '1px solid var(--border)', borderRadius: 7, padding: '7px 11px', color: 'var(--text)', cursor: 'pointer' } as const
