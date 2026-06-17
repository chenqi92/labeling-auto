import { useRef, useState } from 'react'
import { X } from 'lucide-react'

// 分隔符：半/全角逗号、顿号、空白
const SEP = /[\s,，、]+/

function parse(value: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const t of value.split(SEP)) {
    const s = t.trim()
    if (s && !seen.has(s)) {
      seen.add(s)
      out.push(s)
    }
  }
  return out
}

interface Props {
  /** 逗号连接的标签串（与后端契约保持一致）。 */
  value: string
  onChange: (value: string) => void
  /** 输入框为空时按回车触发（一般用于直接开始检测）。 */
  onEnter?: () => void
  disabled?: boolean
  placeholder?: string
  className?: string
}

/** 标签输入框：空格 / 逗号 / 回车把已输入文字生成一个标签块。对中文输入法（IME）安全。 */
export default function TagInput({ value, onChange, onEnter, disabled, placeholder, className }: Props) {
  const tags = parse(value)
  const [input, setInput] = useState('')
  const composingRef = useRef(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const commit = (text: string) => {
    const merged = parse([...tags, ...parse(text)].join(','))
    onChange(merged.join(','))
    setInput('')
  }

  const removeAt = (i: number) => {
    onChange(tags.filter((_, idx) => idx !== i).join(','))
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (composingRef.current || e.nativeEvent.isComposing) return // 输入法选词中，放行
    if (e.key === 'Enter') {
      if (input.trim()) {
        e.preventDefault()
        commit(input)
      } else {
        onEnter?.()
      }
      return
    }
    if (e.key === ' ' || e.key === ',' || e.key === '，' || e.key === '、') {
      if (input.trim()) {
        e.preventDefault()
        commit(input)
      } else {
        e.preventDefault() // 吞掉前导/连续分隔符
      }
      return
    }
    if (e.key === 'Backspace' && input === '' && tags.length > 0) {
      e.preventDefault()
      removeAt(tags.length - 1)
    }
  }

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value
    // 粘贴/输入法上屏后若已带分隔符，直接拆分（输入法选词中不处理）
    if (!composingRef.current && SEP.test(v)) {
      const parts = v.split(SEP)
      const tail = parts.pop() ?? ''
      const head = parts.join(',').trim()
      if (head) commit(head)
      setInput(tail)
      return
    }
    setInput(v)
  }

  return (
    <div
      onClick={() => inputRef.current?.focus()}
      className={`flex min-h-[34px] flex-wrap items-center gap-1 rounded-md border border-slate-300 px-1.5 py-1 text-sm focus-within:border-indigo-400 ${
        disabled ? 'cursor-not-allowed bg-slate-100' : 'cursor-text bg-white'
      } ${className ?? ''}`}
    >
      {tags.map((t, i) => (
        <span
          key={`${t}-${i}`}
          className="flex items-center gap-1 rounded bg-indigo-100 py-0.5 pl-2 pr-1 text-xs font-medium text-indigo-700"
        >
          {t}
          {!disabled && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                removeAt(i)
              }}
              className="rounded-full p-0.5 text-indigo-400 hover:bg-indigo-200 hover:text-indigo-700"
              title="移除"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </span>
      ))}
      <input
        ref={inputRef}
        type="text"
        value={input}
        disabled={disabled}
        placeholder={tags.length === 0 ? placeholder : ''}
        onChange={onInputChange}
        onKeyDown={onKeyDown}
        onCompositionStart={() => (composingRef.current = true)}
        onCompositionEnd={() => (composingRef.current = false)}
        onBlur={() => input.trim() && commit(input)}
        className="min-w-[80px] flex-1 bg-transparent px-1 py-0.5 focus:outline-none disabled:cursor-not-allowed"
      />
    </div>
  )
}
