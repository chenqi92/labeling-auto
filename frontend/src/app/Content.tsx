/** 内容路由：按 appStore.view 渲染对应页面。 */
import { useApp } from '../appStore'
import Workbench from './Workbench'
import Users from './pages/Users'
import Settings from './pages/Settings'
import Projects from './pages/Projects'
import Annotation from './pages/Annotation'
import Registry from './pages/Registry'
import Monitor from './pages/Monitor'
import Jobs from './pages/Jobs'
import Batch from './pages/Batch'
import Training from './pages/Training'
import TrainWizard from './pages/TrainWizard'
import TrainMonitor from './pages/TrainMonitor'
import { NoPerm } from './ui'

export default function Content() {
  const view = useApp((s) => s.view)
  const role = useApp((s) => s.user?.role ?? 'guest')

  switch (view) {
    case 'workbench': return <Workbench />
    case 'projects': return <Projects />
    case 'annotation': return <Annotation />
    case 'registry': return <Registry />
    case 'jobs': return <Jobs />
    case 'batch': return <Batch />
    case 'training': return <Training />
    case 'trainWizard': return <TrainWizard />
    case 'trainMonitor': return <TrainMonitor />
    case 'settings': return <Settings />
    case 'admin': return role === 'admin' ? <Users /> : <NoPerm />
    case 'monitor': return role === 'admin' ? <Monitor /> : <NoPerm />
    default: return <Workbench />
  }
}
