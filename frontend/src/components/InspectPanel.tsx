import { CheckCircle2, XCircle, HelpCircle, ClipboardList } from 'lucide-react'
import { useStore } from '../store'
import type { InspectAnswer } from '../types'

/** 三态答案的配色与图标。 */
function verdictStyle(answer: string) {
  if (answer === '是') return { Icon: CheckCircle2, cls: 'text-emerald-600', chip: 'bg-emerald-50 text-emerald-700' }
  if (answer === '否') return { Icon: XCircle, cls: 'text-rose-600', chip: 'bg-rose-50 text-rose-700' }
  return { Icon: HelpCircle, cls: 'text-amber-600', chip: 'bg-amber-50 text-amber-700' }
}

function AnswerRow({ a, idx }: { a: InspectAnswer; idx: number }) {
  const { Icon, cls, chip } = verdictStyle(a.answer)
  return (
    <li className="rounded-md border border-slate-100 px-2.5 py-2">
      <div className="flex items-start gap-2">
        <span className="w-4 shrink-0 text-right text-[10px] leading-5 text-slate-400">{idx + 1}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <Icon className={`h-4 w-4 shrink-0 ${cls}`} />
            <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${chip}`}>{a.answer}</span>
            <span className="min-w-0 flex-1 truncate text-sm text-slate-700" title={a.question}>
              {a.question}
            </span>
          </div>
          {a.detail && <p className="mt-1 pl-0.5 text-xs leading-relaxed text-slate-500">{a.detail}</p>}
        </div>
      </div>
    </li>
  )
}

export default function InspectPanel() {
  const activeImageId = useStore((s) => s.activeImageId)
  const inspections = useStore((s) => s.inspections)
  const busy = useStore((s) => s.busy)
  const task = useStore((s) => s.projects.find((p) => p.id === s.activeProjectId)?.detect.task)

  // 仅在「状态检测」任务下，或当前图已有巡检结果时显示
  const res = activeImageId ? inspections[activeImageId] : undefined
  if (task !== 'inspect' && !res) return null

  const running = activeImageId ? busy[activeImageId] : false

  return (
    <div className="border-b border-slate-200">
      <div className="flex items-center gap-2 px-4 pb-2 pt-3">
        <ClipboardList className="h-4 w-4 text-slate-500" />
        <h2 className="text-sm font-semibold text-slate-700">状态检测</h2>
        {res && (
          <span className="ml-auto text-xs text-slate-400">
            {res.model} · {res.elapsed_ms}ms
          </span>
        )}
      </div>

      <div className="px-3 pb-3">
        {running && !res && (
          <p className="px-2 py-4 text-center text-xs text-slate-400">巡检中…（首次需加载模型，约十几秒）</p>
        )}
        {!running && !res && (
          <p className="px-2 py-4 text-center text-xs text-slate-400">
            输入判断问题后点「巡检当前」
          </p>
        )}
        {res && (
          <ul className="space-y-1.5">
            {res.answers.map((a, i) => (
              <AnswerRow key={i} a={a} idx={i} />
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
