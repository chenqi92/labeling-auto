/** 内容路由：按 appStore.view 渲染对应页面。
 *  已实现：workbench(占位) / 用户管理(真实) / 设置。其余页面随后续阶段逐步落地。 */
import { useApp } from '../appStore'
import Workbench from './Workbench'
import Users from './pages/Users'
import Settings from './pages/Settings'
import Projects from './pages/Projects'
import { NoPerm, StubPage } from './ui'

const STUB_META: Record<string, [string, string]> = {
  annotation: ['数据标注', '画框 / 分割掩膜 / 关键点 · 自动预标注 · 快捷键工作流'],
  training: ['模型训练', '向导式创建 · 实时曲线 / 日志 / 进度 · 上架为可用模型'],
  trainWizard: ['新建训练任务', '向导式 5 步'],
  trainMonitor: ['训练监控', '实时曲线 / 日志 / 进度'],
  registry: ['模型管理 / 引擎', '检测 / VQA / OCR / 分割 / 我的训练模型 · 显存看板'],
  jobs: ['任务中心', '批量推理 / 训练 / 导出 的统一任务列表与详情'],
  batch: ['批量处理', '对整个数据集批跑能力，生成异步任务'],
  monitor: ['资源监控', 'GPU / 显存 / 磁盘 · 运行中任务 · 历史负载'],
}

export default function Content() {
  const view = useApp((s) => s.view)
  const role = useApp((s) => s.user?.role ?? 'guest')

  if (view === 'workbench') return <Workbench />
  if (view === 'projects') return <Projects />
  if (view === 'admin') return role === 'admin' ? <Users /> : <NoPerm />
  if (view === 'monitor' && role !== 'admin') return <NoPerm />
  if (view === 'settings') return <Settings />

  const meta = STUB_META[view]
  return <StubPage title={meta?.[0] ?? '模块'} desc={meta?.[1] ?? '建设中'} />
}
