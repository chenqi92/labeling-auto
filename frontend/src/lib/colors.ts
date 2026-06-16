// 类别配色：一组区分度高的颜色，按类别序号循环取用。
export const PALETTE = [
  '#ef4444', '#3b82f6', '#22c55e', '#f59e0b', '#a855f7',
  '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#14b8a6',
  '#6366f1', '#eab308', '#10b981', '#f43f5e', '#8b5cf6',
  '#0ea5e9', '#d946ef', '#65a30d', '#fb923c', '#2dd4bf',
]

export function colorForIndex(i: number): string {
  return PALETTE[((i % PALETTE.length) + PALETTE.length) % PALETTE.length]
}

/** 给定 hex 颜色返回带透明度的 rgba（用于填充）。 */
export function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}
