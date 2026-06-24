/** 项目与数据集（真实）：项目卡片 · 图片库(上传/删除/筛选) · 数据集版本快照。 */
import { useState } from 'react'
import { useApp } from '../../appStore'
import { selProject, useData } from '../../dataStore'
import type { ProjImage } from '../../types'
import { Btn, Card, Icon, Page, PageHead } from '../ui'
import { confirmDialog, promptDialog, toast } from '../overlays'

type Filter = 'all' | 'todo' | 'done'

export default function Projects() {
  const projects = useData((s) => s.projects)
  const activeId = useData((s) => s.activeProjectId)
  const images = useData((s) => s.images)
  const datasets = useData((s) => s.datasets)
  const uploading = useData((s) => s.uploading)
  const imgQuery = useData((s) => s.imgQuery)
  const cur = useData(selProject)
  const setActiveProject = useData((s) => s.setActiveProject)
  const createProject = useData((s) => s.createProject)
  const deleteProject = useData((s) => s.deleteProject)
  const uploadFiles = useData((s) => s.uploadFiles)
  const removeImage = useData((s) => s.removeImage)
  const snapshotDataset = useData((s) => s.snapshotDataset)
  const openCapability = useApp((s) => s.openCapability)
  const goView = useApp((s) => s.goView)

  const [filter, setFilter] = useState<Filter>('all')
  const newProject = async () => {
    const name = await promptDialog('新项目名称：', '')
    if (name) await createProject(name)
  }
  const onDeleteProject = async (id: string, name: string) => {
    if (await confirmDialog(`删除项目「${name}」及其所有图片与标注？此操作不可撤销。`)) await deleteProject(id)
  }
  const q = imgQuery.trim().toLowerCase()
  const shown: ProjImage[] = images.filter((i) => (filter === 'all' ? true : filter === 'done' ? i.status === 'done' : i.status !== 'done') && (!q || i.filename.toLowerCase().includes(q)))
  const counts = { all: images.length, todo: images.filter((i) => i.status !== 'done').length, done: images.filter((i) => i.status === 'done').length }

  const cardBg = ['linear-gradient(135deg,#16344f,#0f2735)', 'linear-gradient(135deg,#3a3f47,#22262d)', 'linear-gradient(135deg,#2a3a30,#16201a)']

  return (
    <Page>
      <PageHead title="项目与数据集" sub="一切围绕项目组织 · 图片 / 标注 / 数据集版本归属项目" actions={<Btn label="新建项目" primary icon="plus" onClick={newProject} />} />

      {/* 项目卡片 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: 14, marginBottom: 26 }}>
        {projects.map((p, i) => {
          const active = p.id === activeId
          const pct = p.images ? Math.round((p.labeled / p.images) * 100) : 0
          return (
            <div key={p.id} onClick={() => setActiveProject(p.id)} style={{ background: 'var(--panel)', border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`, borderRadius: 12, padding: 17, cursor: 'pointer', position: 'relative' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <div style={{ width: 38, height: 38, borderRadius: 9, background: cardBg[i % cardBg.length], flex: '0 0 38px' }} />
                {active && <span style={{ fontSize: 10.5, color: 'var(--accent)', background: 'var(--accent-ghost)', borderRadius: 5, padding: '3px 8px' }}>当前</span>}
              </div>
              <div style={{ fontSize: 15, fontWeight: 600 }}>{p.name}</div>
              <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 4 }}>{p.images} 张图片 · {p.classes} 类 · {p.boxes} 框</div>
              <div style={{ marginTop: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text3)', marginBottom: 5 }}><span>标注进度</span><span style={{ fontFamily: 'var(--mono)', color: 'var(--text2)' }}>{pct}%</span></div>
                <div style={{ height: 6, background: 'var(--panel2)', borderRadius: 4, overflow: 'hidden' }}><div style={{ height: '100%', width: `${pct}%`, background: 'var(--accent)', borderRadius: 4 }} /></div>
              </div>
              {projects.length > 1 && (
                <button onClick={(e) => { e.stopPropagation(); onDeleteProject(p.id, p.name) }} title="删除项目" style={{ position: 'absolute', top: 12, right: 12, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', opacity: 0.6 }}>
                  <Icon name="trash" size={14} color="var(--red)" />
                </button>
              )}
            </div>
          )
        })}
      </div>

      {/* 图片库 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ fontSize: 15, fontWeight: 600 }}>图片库 · {cur?.name ?? '—'}</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--panel2)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 15px', fontSize: 13, fontWeight: 600, cursor: uploading || !activeId ? 'not-allowed' : 'pointer', opacity: uploading || !activeId ? 0.5 : 1 }}>
            <Icon name="download" size={15} sw={1.8} />{uploading ? '上传中…' : '上传图片'}
            <input type="file" accept="image/*" multiple disabled={uploading || !activeId} style={{ display: 'none' }} onChange={async (e) => { const f = Array.from(e.target.files ?? []); e.target.value = ''; if (f.length) { try { await uploadFiles(f) } catch (err) { toast(`上传失败：${(err as Error).message}`) } } }} />
          </label>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        {([['all', `全部 ${counts.all}`], ['todo', `未标注 ${counts.todo}`], ['done', `已标注 ${counts.done}`]] as [Filter, string][]).map(([k, label]) => (
          <button key={k} onClick={() => setFilter(k)} style={{ fontSize: 12, padding: '6px 12px', borderRadius: 7, border: `1px solid ${filter === k ? 'var(--accent)' : 'var(--border)'}`, background: filter === k ? 'var(--accent-ghost)' : 'transparent', color: filter === k ? 'var(--accent)' : 'var(--text2)', cursor: 'pointer' }}>{label}</button>
        ))}
      </div>

      {shown.length === 0 ? (
        <Card style={{ marginBottom: 28, textAlign: 'center', color: 'var(--text3)', fontSize: 13, padding: 40 }}>
          {images.length === 0 ? '该项目还没有图片，点「上传图片」开始。' : '当前筛选下没有图片。'}
        </Card>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: 12, marginBottom: 28 }}>
          {shown.map((im) => (
            <div key={im.id} style={{ position: 'relative', borderRadius: 9, overflow: 'hidden', cursor: 'pointer', border: '1px solid var(--border)' }}
              onClick={() => { useData.getState().setActiveImage(im.id); openCapability('detect') }}>
              <img src={im.url} alt={im.filename} style={{ width: '100%', height: 92, objectFit: 'cover', display: 'block', background: 'var(--panel2)' }} />
              <span style={{ position: 'absolute', top: 7, right: 7, width: 8, height: 8, borderRadius: '50%', background: im.status === 'done' ? 'var(--green)' : 'var(--text3)' }} />
              <button onClick={async (e) => { e.stopPropagation(); if (await confirmDialog(`删除图片 ${im.filename}？`)) removeImage(im.id) }} style={{ position: 'absolute', top: 5, left: 5, width: 22, height: 22, borderRadius: 6, background: 'rgba(0,0,0,.5)', border: 'none', cursor: 'pointer', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="trash" size={12} color="#fff" />
              </button>
              <div style={{ padding: '7px 9px', fontSize: 11, color: 'var(--text2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', background: 'var(--panel)' }}>{im.filename}{im.boxes ? ` · ${im.boxes}框` : ''}</div>
            </div>
          ))}
        </div>
      )}

      {/* 数据集版本 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ fontSize: 15, fontWeight: 600 }}>数据集版本</div>
        <Btn label="生成数据集版本（快照当前标注）" icon="plus" onClick={() => snapshotDataset()} disabled={!activeId} />
      </div>
      <Card style={{ padding: 18 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr 1.4fr 1fr .8fr', padding: '0 4px 11px', fontSize: 11, color: 'var(--text3)', borderBottom: '1px solid var(--border-soft)' }}>
          {['版本', '样本 / 类别 / 框', '创建', '划分', '操作'].map((h) => <span key={h}>{h}</span>)}
        </div>
        {datasets.length === 0 && <div style={{ padding: 18, fontSize: 13, color: 'var(--text3)' }}>还没有数据集版本。标注一些图片后点上方按钮生成快照，用于训练。</div>}
        {datasets.map((d, i) => (
          <div key={d.id} style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr 1.4fr 1fr .8fr', alignItems: 'center', padding: '12px 4px', borderBottom: i < datasets.length - 1 ? '1px solid var(--border-soft)' : 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 600, fontFamily: 'var(--mono)' }}>{d.name}</span>
              {i === 0 && <span style={{ fontSize: 9.5, color: 'var(--accent)', background: 'var(--accent-ghost)', borderRadius: 4, padding: '1px 6px' }}>最新</span>}
            </div>
            <span style={{ fontSize: 12.5, fontFamily: 'var(--mono)', color: 'var(--text2)' }}>{d.sample_count} / {d.class_count} 类 / {d.box_count} 框</span>
            <span style={{ fontSize: 12.5, color: 'var(--text2)' }}>{new Date(d.created_at * 1000).toLocaleString('zh-CN', { hour12: false })}</span>
            <span style={{ fontSize: 12.5, fontFamily: 'var(--mono)', color: 'var(--text2)' }}>{d.split}</span>
            <button onClick={() => goView('training')} style={{ fontSize: 12, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, justifySelf: 'start' }}>用于训练</button>
          </div>
        ))}
      </Card>
    </Page>
  )
}
