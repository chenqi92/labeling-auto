/** 应用内提示与对话框：替代原生 alert/confirm/prompt。
 *  用法（非 hook，任意处可调）：toast('已保存','success')；await confirmDialog('确定删除？')；await promptDialog('名称','默认')。
 *  <Overlays/> 挂在 Shell 里渲染 toast 栈与 confirm/prompt 模态。 */
import { useEffect, useState } from 'react'
import { create } from 'zustand'

type ToastType = 'info' | 'success' | 'error'
interface ToastItem { id: number; msg: string; type: ToastType }
interface DialogReq { kind: 'confirm' | 'prompt'; msg: string; def: string; resolve: (v: boolean | string | null) => void }

interface UiState {
  toasts: ToastItem[]
  dialog: DialogReq | null
  push: (t: ToastItem) => void
  remove: (id: number) => void
  setDialog: (d: DialogReq | null) => void
}
const useUi = create<UiState>((set) => ({
  toasts: [],
  dialog: null,
  push: (t) => set((s) => ({ toasts: [...s.toasts, t] })),
  remove: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
  setDialog: (d) => set({ dialog: d }),
}))

let _id = 1
export function toast(msg: string, type: ToastType = 'info'): void {
  const id = _id++
  useUi.getState().push({ id, msg, type })
  setTimeout(() => useUi.getState().remove(id), 3600)
}
export function confirmDialog(msg: string): Promise<boolean> {
  return new Promise((resolve) => useUi.getState().setDialog({ kind: 'confirm', msg, def: '', resolve: (v) => resolve(!!v) }))
}
export function promptDialog(msg: string, def = ''): Promise<string | null> {
  return new Promise((resolve) => useUi.getState().setDialog({ kind: 'prompt', msg, def, resolve: (v) => resolve(typeof v === 'string' ? v : null) }))
}

const TOAST_COLOR: Record<ToastType, [string, string, string]> = {
  info: ['var(--text)', 'var(--panel)', 'var(--border)'],
  success: ['var(--green)', 'var(--green-g)', 'rgba(43,213,118,.4)'],
  error: ['var(--red)', 'var(--red-g)', 'rgba(255,90,95,.4)'],
}

export function Overlays() {
  const toasts = useUi((s) => s.toasts)
  const dialog = useUi((s) => s.dialog)
  const setDialog = useUi((s) => s.setDialog)
  const [input, setInput] = useState('')
  useEffect(() => { if (dialog?.kind === 'prompt') setInput(dialog.def) }, [dialog])
  const close = (val: boolean | string | null) => { dialog?.resolve(val); setDialog(null) }

  return (
    <>
      {/* toast 栈 */}
      <div style={{ position: 'fixed', top: 62, right: 16, zIndex: 300, display: 'flex', flexDirection: 'column', gap: 8, pointerEvents: 'none' }}>
        {toasts.map((t) => {
          const [c, bg, bd] = TOAST_COLOR[t.type]
          return (
            <div key={t.id} style={{ minWidth: 220, maxWidth: 360, background: bg, color: c, border: `1px solid ${bd}`, borderRadius: 9, padding: '10px 14px', fontSize: 13, lineHeight: 1.5, boxShadow: 'var(--shadow)', animation: 'fadeup .15s ease' }}>{t.msg}</div>
          )
        })}
      </div>

      {/* confirm / prompt 模态 */}
      {dialog && (
        <div onClick={() => close(dialog.kind === 'prompt' ? null : false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 320, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: 380, maxWidth: '90vw', background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, boxShadow: 'var(--shadow)', animation: 'popin .12s ease' }}>
            <div style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.6, marginBottom: dialog.kind === 'prompt' ? 12 : 18, whiteSpace: 'pre-wrap' }}>{dialog.msg}</div>
            {dialog.kind === 'prompt' && (
              <input value={input} autoFocus onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') close(input); if (e.key === 'Escape') close(null) }}
                style={{ width: '100%', background: 'var(--panel2)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', color: 'var(--text)', fontSize: 14, outline: 'none', marginBottom: 16 }} />
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button onClick={() => close(dialog.kind === 'prompt' ? null : false)} style={{ fontSize: 13, fontWeight: 600, background: 'var(--panel2)', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 18px', cursor: 'pointer', color: 'var(--text)' }}>取消</button>
              <button onClick={() => close(dialog.kind === 'prompt' ? input : true)} style={{ fontSize: 13, fontWeight: 600, background: 'var(--accent)', color: '#04140f', border: 'none', borderRadius: 8, padding: '9px 18px', cursor: 'pointer' }}>确定</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
