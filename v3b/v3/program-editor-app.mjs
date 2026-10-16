/** V3-B training program editor. Reads/writes only the isolated V3 database. */
import {validateV3,clone,LEGACY_PROGRAM_ID,migrateV2,V3_DB_NAME} from './migrate-core.mjs';
import {readEditor,saveEditor,readEditorBackup,restorePrevious,importEditorJSON,initializeV3FromBackup} from './program-editor-storage.mjs';
import * as E from './program-editor-core.mjs';

const $=selector=>document.querySelector(selector);
const esc=value=>String(value??'').replace(/[&<>"']/g,s=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
let doc=null,selectedPlanId=null,selectedDayId=null,search='',filter='全部',busy=false,toastTimer=null;
let saveChain=Promise.resolve();
const currentPlan=()=>doc?.programs[selectedPlanId];
const currentDay=()=>currentPlan()?.days.find(d=>d.dayId===selectedDayId);
const icon=(label,mark,action,attrs='')=>`<button type="button" class="tiny" aria-label="${esc(label)}" title="${esc(label)}" data-act="${action}" ${attrs}>${mark}</button>`;
const status=(msg,bad=false)=>{const el=$('#save-status');if(el)el.textContent=msg;$('#status-dot')?.classList.toggle('ok',!bad&&!!doc);$('#status-dot')?.classList.toggle('bad',bad);if(doc)$('#revision-label').textContent=`V3 版本 ${doc.editorRevision||0} · 数据仅在此浏览器`};
const notice=msg=>{const toast=$('#toast');toast.textContent=msg;toast.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>toast.classList.remove('show'),2600)};
const show=dialog=>{if(typeof dialog.showModal==='function')dialog.showModal();else dialog.setAttribute('open','')};
const close=dialog=>{if(typeof dialog.close==='function')dialog.close();else dialog.removeAttribute('open')};
const pinfo=p=>p.days.reduce((n,d)=>n+d.exercises.length,0);
const readFile=file=>file.text().then(JSON.parse);
const muscleMap={flat:'胸部',incline:'胸部',fly:'胸部',push:'三头肌',over:'三头肌',pulldown:'背部',row:'背部',cable:'背部',rear:'肩部',curl:'二头肌',hammer:'二头肌',squat:'腿部',rdl:'腿部',split:'腿部',legcurl:'腿部',hip:'臀部',calf:'小腿',press:'肩部',lateral:'肩部',latcable:'肩部',rear2:'肩部',abs:'核心',plank:'核心'};
const muscleOf=x=>x.muscle||muscleMap[x.exerciseId?.replace('sys:','')]||'其他';
const download=(name,content)=>{const blob=new Blob([content],{type:'application/json;charset=utf-8'}),url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2500)};
const timeFilename=()=>new Date().toISOString().slice(0,19).replace(/[:T]/g,'-');

async function load(){
 $('#loading').hidden=false;$('#workspace').hidden=true;$('#empty').hidden=true;
 try{const value=await readEditor();if(!value){doc=null;$('#empty').hidden=false;status('未找到V3迁移数据',true);return}
  validateV3(value);doc=value;
  if(!doc.programs[selectedPlanId])selectedPlanId=doc.activeProgramId;
  if(!currentPlan()?.days.some(d=>d.dayId===selectedDayId))selectedDayId=currentPlan()?.days[0]?.dayId;
  $('#workspace').hidden=false;status('已读取V3数据。修改训练计划会自动保存。');render();
 }catch(err){doc=null;$('#empty').hidden=false;status('读取失败：'+err.message,true);notice(err.message)}finally{$('#loading').hidden=true}
}
function render(){if(!doc)return;
 const all=Object.values(doc.programs).sort((a,b)=>(a.archived?1:0)-(b.archived?1:0)||((a.programId===doc.activeProgramId)?-1:(b.programId===doc.activeProgramId)?1:0)||a.name.localeCompare(b.name));
 $('#plan-count').textContent=all.length;
 $('#program-list').innerHTML=all.map(p=>`<button type="button" class="program-choice ${p.programId===selectedPlanId?'active':''}" data-act="select-plan" data-id="${esc(p.programId)}" aria-pressed="${p.programId===selectedPlanId}"><span class="choice-name">${esc(p.name)}</span><span class="choice-meta">${p.splitCount} 分化 · ${pinfo(p)} 个动作 ${p.programId===doc.activeProgramId?'<span class="tag">当前启用</span>':''}${p.archived?'<span class="tag archived">已归档</span>':''}</span></button>`).join('');
 const p=currentPlan();if(!p){$('#editor-main').innerHTML='<div class="panel">请选择一套训练计划。</div>';return}
 const day=currentDay();if(!day){selectedDayId=p.days[0]?.dayId}
 const active=p.programId===doc.activeProgramId,archived=!!p.archived,readOnly=archived||p.programId===LEGACY_PROGRAM_ID,restrict=readOnly?'disabled':'';
 const info=`<div class="panel hero-panel"><div class="overline lime">${active?'ACTIVE TRAINING PROGRAM':'PERSONAL PROGRAM'} / ${p.splitCount} SPLIT</div><div class="toolbar"><div><h2 class="hero-title">${esc(p.name)}</h2><div class="hero-desc">${active?'当前启用的模板':'备用训练模板'} · 编辑器所选模板尚未关联新版日历排课（V3.0-C）</div></div><div class="toolbar-actions">${!active&&!archived?'<button class="btn btn-primary small" data-act="activate">设为启用</button>':''}<button class="btn btn-outline small" data-act="duplicate">复制模板</button></div></div><div class="stat-row"><div class="stat-box"><b>${p.splitCount}</b> 训练日</div><div class="stat-box"><b>${pinfo(p)}</b> 动作条目</div><div class="stat-box"><b>${p.revision||1}</b> 修订版本</div></div></div>`;
 const general=`<div class="panel edit-panel"><div class="section-heading"><h2>计划基本设置</h2><div class="toolbar-actions">${archived?'<button class="btn btn-outline small" data-act="unarchive">恢复归档</button>':`<button class="btn btn-outline small" data-act="archive" ${active||p.programId===LEGACY_PROGRAM_ID?'disabled':''}>归档</button>`}<button class="btn btn-danger small" data-act="delete-plan" ${active||p.programId===LEGACY_PROGRAM_ID?'disabled':''}>删除计划</button></div></div><label class="field">计划名称<input id="program-name" data-edit="program-name" maxlength="60" value="${esc(p.name)}" ${restrict}></label><div class="subheading">选择几分化</div><div class="split-options">${E.SPLIT_OPTIONS.map(n=>`<button class="split-option ${n===p.splitCount?'active':''}" data-act="change-split" data-split="${n}" ${restrict} aria-pressed="${n===p.splitCount}">${n} 分化</button>`).join('')}</div><p class="hint" style="margin:12px 0 0">分化是训练日类型数量，不代表每周必须训练多少次；修改分化时，剩余训练日和已有历史记录都会保留。</p></div>`;
 const tabs=`<div class="panel edit-panel"><div class="section-heading"><h2>自定义训练日</h2><span class="hint">可编辑名称、目标肌群及动作组合</span></div><div class="day-tabs">${p.days.map((d,i)=>`<button class="day-tab ${d.dayId===selectedDayId?'active':''}" data-act="select-day" data-id="${esc(d.dayId)}"><span>DAY ${String(i+1).padStart(2,'0')}</span><b>${esc(d.name)}</b></button>`).join('')}</div></div>`;
 const bottom=`<div class="panel"><div class="section-heading"><h2>版本、备份与回退</h2><span class="badge">V3 独立数据库</span></div><div class="safety-grid"><div class="safety-tile"><h3>JSON 完整备份</h3><p>包含现有计划、自建动作和迁移历史。文件只下载到你的电脑。</p><button class="btn btn-primary small" data-act="export">导出V3 JSON</button></div><div class="safety-tile"><h3>恢复上一个修改前版本</h3><p>每次保存前自动保留上一份V3快照，遇到错误可回退。</p><button class="btn btn-outline small" data-act="restore-previous">恢复上一步</button></div><div class="safety-tile"><h3>导入V3备份</h3><p>会校验原始V2训练历史，不允许无提示覆盖。</p><button class="btn btn-outline small" data-act="open-import">选择备份</button></div><div class="safety-tile"><h3>V2 历史安全</h3><p>V2 本地数据库与原始迁移快照只读；本阶段不修改旧训练会话。</p><a class="btn btn-outline small" href="./preview-help.html">预览使用说明 ↗</a><button class="btn btn-danger small" data-act="preview-reset">清空预览数据</button></div></div><p class="bottom-text">重要：本地浏览器数据可能被清理；请定期导出 JSON。V3.0-B 只实现计划编辑，实际训练和日历联动将在 V3.0-C 接入。</p></div>`;
 $('#editor-main').innerHTML=`<div class="editor-stack">${info}${general}${tabs}${readOnly?'<div class="info-box">本模板只读：已归档的计划可先恢复；原始 V2 四分化模板请先点击「复制模板」再自由编辑。</div>':''}${renderDayEditor(p,p.days.find(d=>d.dayId===selectedDayId)||p.days[0],readOnly)}${renderCatalog(p,readOnly)}${bottom}</div>`;
 status('已自动保存 · 仅修改V3数据库');
}
function renderDayEditor(p,day,archived){if(!day)return '<div class="panel">没有训练日。</div>';const restrict=archived?'disabled':'';
 const idx=p.days.findIndex(x=>x.dayId===day.dayId);
 const muscleChips=E.MUSCLE_OPTIONS.map(m=>`<button class="muscle-chip ${day.muscleGroups.includes(m)?'selected':''}" data-act="muscle" data-value="${esc(m)}" ${restrict} aria-pressed="${day.muscleGroups.includes(m)}">${esc(m)}</button>`).join('');
 const rows=day.exercises.map((entry,i)=>{
  const meta=doc.exerciseCatalog[entry.exerciseId]||{name:entry.exerciseId};const t=entry.targetReps||{min:8,max:12,unit:'reps',perSide:false};
  const controls=`data-entry="${esc(entry.entryId)}"`;
  return `<div class="action-card" data-entry-id="${esc(entry.entryId)}"><div class="action-top"><div class="action-title"><span class="action-index">${String(i+1).padStart(2,'0')}</span><div><strong>${esc(meta.name)}</strong><div class="action-kind">${esc(muscleOf(meta))} ${meta.origin==='user'?'· 自建动作':'· 系统动作'}</div></div></div><div class="mini-btns">${icon('动作上移','↑','move-up',`data-id="${esc(entry.entryId)}" ${i===0||archived?'disabled':''}`)}${icon('动作下移','↓','move-down',`data-id="${esc(entry.entryId)}" ${i===day.exercises.length-1||archived?'disabled':''}`)}${icon('从当前训练日删除动作','×','remove-entry',`data-id="${esc(entry.entryId)}" ${restrict}`)}</div></div>
  <div class="inputs-row">
  <label class="field small-field">组数<input type="number" inputmode="numeric" data-edit="sets" ${controls} min="1" max="12" step="1" value="${entry.targetSets}" ${restrict}></label>
  <label class="field small-field">最低${t.unit==='seconds'?'秒数':'次数'}<input type="number" inputmode="numeric" data-edit="min" ${controls} min="1" max="600" value="${t.min}" ${restrict}></label>
  <label class="field small-field">最高${t.unit==='seconds'?'秒数':'次数'}<input type="number" inputmode="numeric" data-edit="max" ${controls} min="1" max="600" value="${t.max}" ${restrict}></label>
  <label class="field small-field">目标RIR<input type="number" inputmode="numeric" data-edit="rir" ${controls} min="0" max="10" value="${entry.targetRIR}" ${restrict}></label>
  <label class="field small-field">组间休息(秒)<input type="number" inputmode="numeric" data-edit="rest" ${controls} min="0" max="900" step="5" value="${entry.restSeconds}" ${restrict}></label>
  <label class="field small-field">单位<select data-edit="unit" ${controls} ${restrict}><option value="reps" ${t.unit==='reps'?'selected':''}>次数</option><option value="seconds" ${t.unit==='seconds'?'selected':''}>秒数</option></select></label>
  </div><label class="checkrow"><input type="checkbox" data-edit="perSide" ${controls} ${t.perSide?'checked':''} ${t.unit==='seconds'||archived?'disabled':''}>每侧分别计算次数</label></div>`;
 }).join('');
 return `<section class="panel edit-panel" id="day-editor"><div class="section-heading"><h2>DAY ${idx+1} · 训练日设置</h2><div class="toolbar-actions"><button class="btn btn-outline small" data-act="day-up" ${idx===0||archived?'disabled':''}>↑ 调前</button><button class="btn btn-outline small" data-act="day-down" ${idx===p.days.length-1||archived?'disabled':''}>↓ 调后</button></div></div><label class="field">训练日名称<input id="day-name" data-edit="day-name" maxlength="60" value="${esc(day.name)}" ${restrict}></label><div class="subheading">目标训练肌群（支持多选）</div><div class="muscle-chips">${muscleChips}</div><div class="custom-muscle-row"><input id="custom-muscle-name" maxlength="20" placeholder="输入其他肌群，例如前臂" ${restrict}><button class="btn btn-outline small" data-act="add-muscle" ${restrict}>＋ 添加肌群</button></div><div class="section-heading" style="margin-top:24px"><h2>动作与训练参数</h2><span class="hint">${day.exercises.length} 个动作 · ↑↓ 调整顺序</span></div><div class="action-list">${rows||'<div class="empty-hint">该训练日还没有动作。在下方动作库选择动作，或创建一个你自己的动作。</div>'}</div></section>`;
}
function renderCatalog(p,archived){return `<section class="panel catalog-panel"><div class="section-heading"><h2>添加训练动作</h2><button class="btn btn-primary small" data-act="new-exercise" ${archived?'disabled':''}>＋ 自建动作</button></div><div class="catalog-tools"><input id="exercise-search" type="search" autocomplete="off" placeholder="搜索动作名称 / 肌群" value="${esc(search)}"><select id="muscle-filter">${['全部',...E.MUSCLE_OPTIONS,'我的动作'].map(x=>`<option ${filter===x?'selected':''} value="${esc(x)}">${esc(x)}</option>`).join('')}</select></div><div id="catalog-list" class="catalog-list">${catalogHTML(archived)}</div><p class="fineprint" style="margin:12px 0 0">系统23个动作保留原有 ID；用户自建动作拥有独立永久 ID，同一个动作可重复加入不同训练日。</p></section>`}
function catalogHTML(archived){const arr=Object.values(doc.exerciseCatalog).filter(x=>{
 if(filter==='我的动作'&&x.origin!=='user')return false;
 if(filter!=='全部'&&filter!=='我的动作'&&!String(muscleOf(x)).includes(filter))return false;
 if(search&&!(`${x.name} ${muscleOf(x)}`.toLowerCase().includes(search.toLowerCase())))return false;
 return true;
 }).sort((a,b)=>(a.origin==='user'?0:1)-(b.origin==='user'?0:1)||a.name.localeCompare(b.name,'zh-CN')).slice(0,65);
 return arr.map(x=>`<div class="catalog-line"><div><div class="name">${esc(x.name)}</div><div class="meta">${esc(muscleOf(x))} · ${x.origin==='user'?'自建':'系统'} · ${esc(x.unit==='seconds'?'秒数':'次数')}</div></div><div class="toolbar-actions">${x.origin==='user'?`<button class="btn btn-outline small" data-act="edit-custom" data-id="${esc(x.exerciseId)}">编辑</button><button class="btn btn-danger small" data-act="delete-custom" data-id="${esc(x.exerciseId)}">删库</button>`:''}<button class="btn btn-primary small" data-act="add-entry" data-id="${esc(x.exerciseId)}" ${archived?'disabled':''}>＋ 添加</button></div></div>`).join('')||'<div class="empty-hint">没有符合条件的动作。你也可以新建动作。</div>';
}
function renderCatalogOnly(){const el=$('#catalog-list');if(el)el.innerHTML=catalogHTML(currentPlan()?.archived)}

function mutate(fn,description='修改训练计划'){
 if(!doc||busy)return;
 busy=true;status('正在保存：'+description);
 saveChain=saveChain.then(async()=>{
  const next=fn(doc),revision=Number(doc.editorRevision)||0;
  const saved=await saveEditor(next,{expectedRevision:revision,reason:description});doc=saved;
  if(!doc.programs[selectedPlanId])selectedPlanId=doc.activeProgramId;
  if(!currentPlan()?.days.some(x=>x.dayId===selectedDayId))selectedDayId=currentPlan()?.days[0]?.dayId;
  render();notice(description+' · 已保存');
 }).catch(err=>{render();status('保存失败：'+err.message,true);notice('操作失败：'+err.message)}).finally(()=>{busy=false});
}
function getNewPlanId(before,after){return Object.keys(after.programs).find(x=>!before.programs[x])}
const ask=(msg)=>window.confirm(msg);
async function clickAction(e){
 const button=e.target.closest('[data-act]');if(!button||(!doc&&!['reload','open-import','demo-start','preview-reset'].includes(button.dataset.act)))return;
 const act=button.dataset.act,id=button.dataset.id,plan=currentPlan(),day=currentDay();
 try{
  switch(act){
   case 'demo-start':{
    if(!ask('将新建一份独立的演示训练计划，仅保存在此浏览器的预览库中；不会修改正式版或电脑上的 V3 数据。确认继续？'))return;
    const emptyV2={version:1,days:{},workouts:{},review:{},learn:{},videos:{}};
    const example=migrateV2(emptyV2,{now:new Date().toISOString(),source:'preview-synthetic'});
    await initializeV3FromBackup(example);
    notice('示例训练计划已创建');await load();break;
   }
   case 'preview-reset':{
    if(!ask('只清空当前网站的 V3.0-B【预览数据】？确认前请先导出 V3 JSON。此操作不会删除线上 V2 打卡记录，也不会删除电脑 localhost 数据。'))return;
    const result=await new Promise((resolve,reject)=>{const req=indexedDB.deleteDatabase(V3_DB_NAME);req.onsuccess=()=>resolve(true);req.onerror=()=>reject(req.error||new Error('删除预览库失败'));req.onblocked=()=>reject(new Error('请关闭其他正在使用预览版的标签页后重试'))});
    doc=null;selectedPlanId=null;selectedDayId=null;notice('预览数据已清空');await load();break;
   }
   case 'reload':await load();break;
   case 'select-plan':selectedPlanId=id;selectedDayId=doc.programs[id].days[0].dayId;render();window.scrollTo({top:0,behavior:'smooth'});break;
   case 'select-day':selectedDayId=id;render();$('#day-editor')?.scrollIntoView({block:'start',behavior:'smooth'});break;
   case 'new-plan':$('#plan-form').reset();show($('#plan-dialog'));break;
   case 'duplicate':{const from=selectedPlanId;mutate(old=>{const next=E.duplicateProgram(old,from);selectedPlanId=getNewPlanId(old,next);selectedDayId=next.programs[selectedPlanId].days[0].dayId;return next},'复制训练计划');break;}
   case 'activate':mutate(old=>E.activateProgram(old,selectedPlanId),'切换当前训练计划');break;
   case 'archive':if(ask('归档这套训练计划？计划仍然保留，之后可以恢复。'))mutate(old=>E.archiveProgram(old,selectedPlanId,true),'归档计划');break;
   case 'unarchive':mutate(old=>E.archiveProgram(old,selectedPlanId,false),'恢复归档计划');break;
   case 'delete-plan':if(ask('确定永久删除这套计划？若有关联历史训练，系统会拒绝删除。请提前备份。'))mutate(old=>E.deleteProgram(old,selectedPlanId),'删除训练计划');break;
   case 'change-split':{const num=Number(button.dataset.split);if(plan.splitCount===num)return;const losing=plan.days.slice(num).filter(d=>d.exercises.length);if(losing.length&&!ask(`从${plan.splitCount}分化改为${num}分化，将移除末尾${losing.length}个非空训练日的动作配置（不影响历史训练）。确定？`))return;mutate(old=>{const next=E.changeSplitCount(old,selectedPlanId,num,{confirmLoss:true});selectedDayId=next.programs[selectedPlanId].days[Math.min(num-1,0)].dayId;return next},'修改分化模式');break;}
   case 'day-up':mutate(old=>E.moveDay(old,selectedPlanId,selectedDayId,-1),'调整训练日顺序');break;
   case 'day-down':mutate(old=>E.moveDay(old,selectedPlanId,selectedDayId,1),'调整训练日顺序');break;
   case 'muscle':{const x=button.dataset.value;mutate(old=>{const d=currentDay();const groups=d.muscleGroups.includes(x)?d.muscleGroups.filter(v=>v!==x):[...d.muscleGroups,x];return E.renameDay(old,selectedPlanId,selectedDayId,{muscleGroups:groups})},'修改目标肌群');break;}
   case 'add-muscle':{const x=($('#custom-muscle-name')?.value||'').trim();if(!x){notice('请输入肌群名称');return}mutate(old=>E.renameDay(old,selectedPlanId,selectedDayId,{muscleGroups:[...new Set([...currentDay().muscleGroups,x])]}),'添加自定义肌群');break;}
   case 'move-up':mutate(old=>E.moveExercise(old,selectedPlanId,selectedDayId,id,-1),'动作上移');break;
   case 'move-down':mutate(old=>E.moveExercise(old,selectedPlanId,selectedDayId,id,1),'动作下移');break;
   case 'remove-entry':if(ask('从当前训练日移除这个动作？历史训练记录不受影响。'))mutate(old=>E.removeExercise(old,selectedPlanId,selectedDayId,id),'移除训练动作');break;
   case 'add-entry':mutate(old=>E.addExercise(old,selectedPlanId,selectedDayId,id),'添加训练动作');break;
   case 'new-exercise':$('#exercise-form').reset();$('#exercise-form').elements.unit.disabled=false;$('#exercise-form').elements.editId.value='';$('#exercise-dialog-title').textContent='创建自定义动作';$('#add-now-label').hidden=false;$('#video-field').hidden=false;show($('#exercise-dialog'));break;
   case 'edit-custom':{const o=doc.exerciseCatalog[id];if(!o||o.origin!=='user')return;$('#exercise-form').reset();const el=$('#exercise-form').elements;el.editId.value=id;el.name.value=o.name;el.muscle.value=o.muscle;el.unit.value=o.unit;el.unit.disabled=true;el.description.value=o.description||'';$('#video-field').hidden=true;$('#add-now-label').hidden=true;$('#exercise-dialog-title').textContent='编辑自建动作';show($('#exercise-dialog'));break}
   case 'delete-custom':if(ask('确认删除这个自建动作库条目？如果仍在训练计划或训练历史中使用，程序会拒绝删除。'))mutate(old=>E.deleteCustomExercise(old,id),'删除自建动作');break;
   case 'export':download(`12W_SPORT_V3B_完整备份_${timeFilename()}.json`,JSON.stringify(doc,null,2));notice('已生成V3 JSON备份');break;
   case 'restore-previous':if(!ask('恢复上一步修改前的V3数据？当前状态会另存为回退快照，且不会修改V2历史。请先导出备份。'))return;{const saved=await restorePrevious({expectedRevision:doc.editorRevision||0});doc=saved;selectedPlanId=doc.activeProgramId;selectedDayId=currentPlan().days[0].dayId;render();notice('已恢复上一版本');}break;
   case 'open-import':show($('#import-dialog'));break;
  }
 }catch(err){status('操作失败：'+err.message,true);notice(err.message)}
}
function editField(e){if(!doc||busy)return;const target=e.target,edit=target.dataset.edit;if(!edit)return;
 const plan=currentPlan(),day=currentDay();
 if(plan.archived||plan.programId===LEGACY_PROGRAM_ID)return;
 const val=target.type==='checkbox'?target.checked:target.value;
 if(edit==='program-name')mutate(old=>E.renameProgram(old,selectedPlanId,val),'重命名计划');
 else if(edit==='day-name')mutate(old=>E.renameDay(old,selectedPlanId,selectedDayId,{name:val}),'重命名训练日');
 else if(['sets','min','max','rir','rest','perSide','unit'].includes(edit)){
  const entryId=target.dataset.entry;
  mutate(old=>E.updatePrescription(old,selectedPlanId,selectedDayId,entryId,{[edit]:val}),'修改训练参数');
 }
}
$('#plan-form').addEventListener('submit',e=>{
 e.preventDefault();const f=e.currentTarget,n=f.elements.name.value,split=Number(f.elements.split.value),blank=f.elements.mode.value==='blank';
 close($('#plan-dialog'));
 mutate(old=>{const next=E.createProgram(old,{name:n,splitCount:split,blank});selectedPlanId=getNewPlanId(old,next);selectedDayId=next.programs[selectedPlanId].days[0].dayId;return next},'创建训练计划');
});
$('#exercise-form').addEventListener('submit',e=>{
 e.preventDefault();const f=e.currentTarget,els=f.elements,editId=els.editId.value,name=els.name.value,muscle=els.muscle.value,unit=els.unit.value,description=els.description.value,videoUrl=els.videoUrl.value,addNow=els.addNow.checked;
 close($('#exercise-dialog'));
 if(editId)mutate(old=>E.editCustomExercise(old,editId,{name,muscle,description}),'修改自建动作');
 else mutate(old=>{const next=E.createCustomExercise(old,{name,muscle,unit,description,videoUrl});if(!addNow)return next;const newId=Object.keys(next.exerciseCatalog).find(id=>!old.exerciseCatalog[id]);return E.addExercise(next,selectedPlanId,selectedDayId,newId)},'创建自建动作'+(addNow?'并添加':''));
});
$('#restore-file').addEventListener('change',async e=>{
 const f=e.target.files?.[0];e.target.value='';if(!f)return;
 if(f.size>10_000_000){notice('文件过大（最多10MB）');return}
 if(!ask('确认用选中的V3 JSON备份恢复本地编辑器吗？请先导出当前备份。'))return;
 try{const raw=await readFile(f);const result=doc?await importEditorJSON(raw,{expectedRevision:doc.editorRevision||0}):await initializeV3FromBackup(raw);doc=result;$('#empty').hidden=true;$('#workspace').hidden=false;selectedPlanId=doc.activeProgramId;selectedDayId=currentPlan().days[0].dayId;close($('#import-dialog'));render();notice('V3 JSON已安全导入');}catch(err){notice('导入失败：'+err.message);status('导入失败：'+err.message,true)}
});
document.addEventListener('click',e=>{const closer=e.target.closest('[data-close]');if(closer)close(document.getElementById(closer.dataset.close));else clickAction(e)});
document.getElementById('workspace').addEventListener('change',editField);
document.getElementById('workspace').addEventListener('input',e=>{const t=e.target;if(t.id==='exercise-search'){search=t.value;renderCatalogOnly()}else if(t.id==='muscle-filter'){filter=t.value;renderCatalogOnly()}});
document.getElementById('workspace').addEventListener('change',e=>{if(e.target.id==='muscle-filter'){filter=e.target.value;renderCatalogOnly()}});
load();
