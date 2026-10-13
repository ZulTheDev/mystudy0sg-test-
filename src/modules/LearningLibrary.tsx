import {useState} from 'react';
import {departments,mutation,permitsManager,type Department} from '../portal-data';
import {useRecords,useNotice,Notices,Field,Empty,deptLabels} from './common';
type Resource={id:string;title:string;department:Department|null;category:'sop'|'course';content_text:string;approved:boolean;version:number};
type Props={grants:Array<{role:string;department:string|null}>};
export function LearningLibrary({grants}:Props){const records=useRecords<Resource>('v14_learning_resources','id,title,department,category,content_text,approved,version');const state=useNotice();
 const isFore=grants.some(g=>g.role==='fore_director');const managers=departments.filter(d=>permitsManager(grants,d));
 const[title,setTitle]=useState('');const[content,setContent]=useState('');const[category,setCategory]=useState<'sop'|'course'>('sop');const[department,setDepartment]=useState<Department|null>(managers[0]??null);const[id,setId]=useState<string|null>(null);const[expanded,setExpanded]=useState<string|null>(null);
 const save=()=>void state.run(async()=>{await mutation('v14_learning_save',{p_title:title,p_department:department,p_category:category,p_content:content,p_id:id});await records.refresh();setId(null);setTitle('');setContent('');},'Resource draft saved for approval');
 return <section className="module-section"><p className="section-lead">Every organizer sees approved SOPs and courses for their assigned department. Fore Directors and department Directors can create or approve resources. Drafts are not shown to ordinary members.</p>
 <Notices loading={records.loading} error={records.error||state.error} success={state.notice}/>
 {managers.length>0&&<details className="editor-box"><summary>{id?'Edit resource':'Write SOP or course'}</summary><div className="form-grid">
  <Field label="Title"><input maxLength={160} value={title} onChange={e=>setTitle(e.target.value)}/></Field>
  <Field label="Type"><select value={category} onChange={e=>setCategory(e.target.value as 'sop'|'course')}><option value="sop">Standard operating procedure</option><option value="course">Learning course</option></select></Field>
  <Field label="Which department?"><select value={department??''} onChange={e=>setDepartment(e.target.value?e.target.value as Department:null)}>{isFore&&<option value="">All organizers</option>}{managers.map(d=><option key={d} value={d}>{deptLabels[d]}</option>)}</select></Field>
  <Field label="Lesson / SOP content (plain text)"><textarea rows={10} maxLength={12000} value={content} onChange={e=>setContent(e.target.value)} placeholder="Learning goal, steps, what to do if stuck, and safety notes..."/></Field>
  <div className="form-actions"><button type="button" disabled={!title.trim()||!content.trim()||state.busy} onClick={save}>Save for review</button></div>
 </div></details>}
 <h3>Your library</h3>{!records.data.length?<Empty>No approved learning resources yet. Ask your department Director to publish your first SOP or course.</Empty>:<div className="record-list">{records.data.map(r=><article key={r.id} className="record-card"><div className="record-top"><strong>{r.title}</strong><span>{r.category.toUpperCase()} · {r.approved?'Approved':'Draft'} · v{r.version}</span></div>
  <p>{r.department?deptLabels[r.department]:'All organizers'}</p><button className="secondary-button" type="button" onClick={()=>setExpanded(v=>v===r.id?null:r.id)}>{expanded===r.id?'Close':'Read resource'}</button>
  {expanded===r.id&&<pre className="v14-lesson">{r.content_text}</pre>}
  {managers.length>0&&(isFore||(r.department!==null&&managers.includes(r.department)))&&<div className="record-actions"><button className="secondary-button" type="button" onClick={()=>{setId(r.id);setTitle(r.title);setContent(r.content_text);setCategory(r.category);setDepartment(r.department);}}>Edit</button>
  {!r.approved&&<button type="button" onClick={()=>void state.run(async()=>{await mutation('v14_learning_approve',{p_id:r.id});await records.refresh();},'Resource approved')}>Approve & publish internally</button>}</div>}</article>)}</div>}
 </section>;
}
