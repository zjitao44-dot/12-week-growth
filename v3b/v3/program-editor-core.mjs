/** V3.0-B: pure program/editor operations. Never mutate source data, sessions, legacyRaw, or V2 storage. */
import {clone,validateV3,LEGACY_PROGRAM_ID,MY_FOUR_SPLIT} from './migrate-core.mjs';

const iso = () => new Date().toISOString();
const gen = () => (globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2,11)}`);
const tidy = (value,max=64) => String(value??'').trim().slice(0,max);
const mustName = (s,label='名称') => {const v=tidy(s,60);if(!v)throw Error(`${label}不能为空`);return v};
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
const numberBetween=(raw,min,max,label)=>{const n=Number(raw);if(!Number.isInteger(n)||n<min||n>max)throw Error(`${label}需要在 ${min}–${max} 之间`);return n};
const getPlan=(doc,id)=>{const p=doc.programs[id];if(!p)throw Error('训练计划不存在');return p};
const getDay=(plan,dayId)=>{const day=plan.days.find(d=>d.dayId===dayId);if(!day)throw Error('训练日不存在');return day};
const getEntry=(day,entryId)=>{const entry=day.exercises.find(e=>e.entryId===entryId);if(!entry)throw Error('此动作条目不存在');return entry};
const unique=(prefix,id=gen())=>`${prefix}:${id}`;
const updated=(doc,planId=null)=>{const d=clone(doc);d.editorMeta={...(d.editorMeta||{}),lastModifiedAt:iso()};if(planId&&d.programs[planId]){d.programs[planId].revision=(Number(d.programs[planId].revision)||0)+1;d.programs[planId].updatedAt=iso()}validateEditorDocument(d);return d};
const change=(doc,planId,modifier,{allowArchived=false}={})=>{const copy=clone(doc);const p=getPlan(copy,planId);if(planId===LEGACY_PROGRAM_ID)throw Error('原始V2四分化模板为只读，请先复制后修改');if(p.archived&&!allowArchived)throw Error('已归档计划为只读，请先恢复');modifier(p,copy);return updated(copy,planId)};
export function validateEditorDocument(doc){
 validateV3(doc);
 for(const plan of Object.values(doc.programs)){
  mustName(plan.name,'计划名称');const dayIds=new Set(plan.days.map(x=>x.dayId));
  for(const mappedId of Object.values(plan.fixedWeekdays||{}))if(!dayIds.has(mappedId))throw Error('排课映射仍引用已经删除的训练日');
  for(const day of plan.days){
   mustName(day.name,'训练日名称');
   if(!Array.isArray(day.muscleGroups))throw Error('目标肌群格式错误');
   for(const entry of day.exercises){
    const r=entry.targetReps;
    if(!r||!['reps','seconds'].includes(r.unit))throw Error('次数单位错误');
    numberBetween(r.min,1,600,'最低次数/秒数');numberBetween(r.max,1,600,'最高次数/秒数');
    if(r.min>r.max)throw Error('动作次数区间不正确');
    numberBetween(entry.targetRIR,0,10,'目标RIR');numberBetween(entry.restSeconds,0,900,'组间休息秒数');
   }
  }
 }
 return true;
}
const presets={
  2:[['上肢综合',['胸部','背部','肩部'],['flat','pulldown','press']],['下肢综合',['腿部','臀部'],['squat','rdl','calf']]],
  3:[['推：胸肩三头',['胸部','肩部','三头肌'],['flat','press','push']],['拉：背部二头',['背部','二头肌'],['pulldown','row','curl']],['腿：下肢',['腿部','臀部'],['squat','rdl','legcurl']]],
  4:MY_FOUR_SPLIT.map(x=>[x.name,x.muscles,x.ids]),
  5:[['胸部',['胸部'],['flat','incline','fly']],['背部',['背部'],['pulldown','row','cable']],['腿臀',['腿部','臀部'],['squat','rdl','hip']],['肩部',['肩部'],['press','lateral','rear2']],['手臂与核心',['二头肌','三头肌','核心'],['curl','push','abs']]],
  6:[['推 A',['胸部','肩部','三头肌'],['flat','press','push']],['拉 A',['背部','二头肌'],['pulldown','row','curl']],['腿 A',['腿部','臀部'],['squat','rdl','legcurl']],['推 B',['胸部','肩部','三头肌'],['incline','lateral','over']],['拉 B',['背部','二头肌'],['cable','rear','hammer']],['腿 B',['腿部','臀部'],['split','hip','calf']]]
};
export const SPLIT_OPTIONS=[2,3,4,5,6];
export const MUSCLE_OPTIONS=['胸部','背部','肩部','二头肌','三头肌','腿部','臀部','核心','小腿','全身','其他'];

function makeEntry(exerciseId,dayId,order=0,{entryId=unique('entry')}={}){
 return {entryId,exerciseId,targetSets:3,targetReps:{min:8,max:12,unit:'reps',perSide:false},targetRIR:2,restSeconds:90,sortIndex:order};
}
function fillIndices(day){day.exercises.forEach((e,i)=>e.sortIndex=i)}
function dayTemplate(triple,index,doc,{dayId=unique('day')}={}){
 const [name,muscles,ids]=triple;
 return {dayId,name,muscleGroups:clone(muscles),exercises:ids.filter(id=>own(doc.exerciseCatalog,'sys:'+id)).map((id,i)=>makeEntry('sys:'+id,dayId,i))};
}
function planFromPreset(doc,{splitCount=4,name='我的训练计划',programId=unique('program'),blank=false}){
 const count=numberBetween(splitCount,2,6,'分化数量');const pname=mustName(name,'训练计划名称');
 const rows=presets[count];
 const days=rows.map((v,i)=>dayTemplate(blank?[`训练日 ${i+1}`,[],[]]:v,i,doc));
 return {programId,name:pname,splitCount:count,revision:1,archived:false,scheduleMode:'sequence',fixedWeekdays:{},days,createdAt:iso(),updatedAt:iso()};
}
export function createProgram(doc,{splitCount=4,name='我的训练计划',blank=false,programId=unique('program')}={}){
 const copy=clone(doc);if(own(copy.programs,programId))throw Error('计划ID重复');
 copy.programs[programId]=planFromPreset(copy,{splitCount,name,blank,programId});return updated(copy);
}
export function duplicateProgram(doc,planId,{programId=unique('program'),name}={}){
 const copy=clone(doc),p=getPlan(copy,planId);if(own(copy.programs,programId))throw Error('计划ID重复');
 const copied=clone(p);copied.programId=programId;copied.name=mustName(name||p.name+' · 副本');copied.revision=1;copied.createdAt=iso();copied.updatedAt=iso();copied.archived=false;
 const oldNew={};copied.days=copied.days.map(day=>{const newDay=unique('day');oldNew[day.dayId]=newDay;return {...day,dayId:newDay,exercises:day.exercises.map(e=>({...e,entryId:unique('entry')}))}});
 copied.fixedWeekdays=Object.fromEntries(Object.entries(copied.fixedWeekdays||{}).filter(([,dayId])=>oldNew[dayId]).map(([weekday,dayId])=>[weekday,oldNew[dayId]]));
 copy.programs[programId]=copied;return updated(copy);
}
export function renameProgram(doc,planId,name){return change(doc,planId,p=>{p.name=mustName(name,'计划名称')})}
export function activateProgram(doc,planId){const copy=clone(doc),p=getPlan(copy,planId);if(p.archived)throw Error('已归档计划不能启用，请先恢复');copy.activeProgramId=planId;return updated(copy)}
export function archiveProgram(doc,planId,archived=true){return change(doc,planId,p=>{if(archived&&doc.activeProgramId===planId)throw Error('不能归档当前启用的计划，请先启用另一套');p.archived=!!archived},{allowArchived:true})}
export function deleteProgram(doc,planId){const copy=clone(doc),p=getPlan(copy,planId);if(planId===LEGACY_PROGRAM_ID)throw Error('原始V2模板受保护，不能删除');if(copy.activeProgramId===planId)throw Error('请先启用另一套计划再删除');if(Object.values(copy.sessions).some(s=>s.programId===planId))throw Error('此计划有关联训练历史，请改用归档');delete copy.programs[planId];return updated(copy)}
export function changeSplitCount(doc,planId,count,{confirmLoss=false}={}){
 const num=numberBetween(count,2,6,'分化数量');return change(doc,planId,(p,d)=>{
  if(num<p.days.length){const removed=p.days.slice(num);if(removed.some(x=>x.exercises.length>0)&&!confirmLoss)throw Error('缩减分化将移除训练日的动作，请先确认');p.days=p.days.slice(0,num)}
  if(num>p.days.length){for(let i=p.days.length;i<num;i++)p.days.push(dayTemplate(presets[num][i]||[`训练日${i+1}`,[],[]],i,d))}
  const validDays=new Set(p.days.map(x=>x.dayId));p.fixedWeekdays=Object.fromEntries(Object.entries(p.fixedWeekdays||{}).filter(([,d])=>validDays.has(d)));
  p.splitCount=num;
 });
}
export function renameDay(doc,planId,dayId,{name,muscleGroups}={}){
 return change(doc,planId,p=>{const d=getDay(p,dayId);if(name!==undefined)d.name=mustName(name,'训练日名称');if(muscleGroups!==undefined){if(!Array.isArray(muscleGroups))throw Error('肌群必须是数组');d.muscleGroups=[...new Set(muscleGroups.map(x=>tidy(x,20)).filter(Boolean))].slice(0,10)}})
}
export function moveDay(doc,planId,dayId,direction){return change(doc,planId,p=>{const i=p.days.findIndex(x=>x.dayId===dayId);if(i<0)throw Error('训练日不存在');const j=i+Number(direction);if(j<0||j>=p.days.length)return;[p.days[i],p.days[j]]=[p.days[j],p.days[i]]})}
export function addExercise(doc,planId,dayId,exerciseId,{entryId=unique('entry')}={}){
 return change(doc,planId,(p,d)=>{if(!own(d.exerciseCatalog,exerciseId))throw Error('动作库中找不到这个动作');const day=getDay(p,dayId);if(p.days.some(x=>x.exercises.some(e=>e.entryId===entryId)))throw Error('条目ID重复');const entry=makeEntry(exerciseId,dayId,day.exercises.length,{entryId});if(d.exerciseCatalog[exerciseId]?.unit==='seconds')entry.targetReps={min:30,max:45,unit:'seconds',perSide:false};day.exercises.push(entry);})
}
export function removeExercise(doc,planId,dayId,entryId){return change(doc,planId,p=>{const d=getDay(p,dayId);getEntry(d,entryId);d.exercises=d.exercises.filter(e=>e.entryId!==entryId);fillIndices(d)})}
export function moveExercise(doc,planId,dayId,entryId,direction){return change(doc,planId,p=>{const d=getDay(p,dayId),i=d.exercises.findIndex(e=>e.entryId===entryId),j=i+Number(direction);if(i<0)throw Error('动作条目不存在');if(j<0||j>=d.exercises.length)return;[d.exercises[i],d.exercises[j]]=[d.exercises[j],d.exercises[i]];fillIndices(d)})}
export function updatePrescription(doc,planId,dayId,entryId,fields){return change(doc,planId,p=>{
 const d=getDay(p,dayId),e=getEntry(d,entryId),next={...e.targetReps};
 if(fields.sets!==undefined)e.targetSets=numberBetween(fields.sets,1,12,'目标组数');
 if(fields.min!==undefined)next.min=numberBetween(fields.min,1,600,'最少次数/秒数');
 if(fields.max!==undefined)next.max=numberBetween(fields.max,1,600,'最多次数/秒数');
 if(fields.unit!==undefined){if(!['reps','seconds'].includes(fields.unit))throw Error('次数单位无效');next.unit=fields.unit}
 if(next.min>next.max)throw Error('最低次数不能高于最高次数');
 if(fields.perSide!==undefined)next.perSide=!!fields.perSide;
 if(next.unit==='seconds')next.perSide=false;
 e.targetReps=next;
 if(fields.rir!==undefined)e.targetRIR=numberBetween(fields.rir,0,10,'目标RIR');
 if(fields.rest!==undefined)e.restSeconds=numberBetween(fields.rest,0,900,'休息秒数');
 })}
export function createCustomExercise(doc,{name,muscle='其他',unit='reps',description='',videoUrl='',exerciseId=unique('user')}={}){
 const copy=clone(doc),n=mustName(name,'动作名称'),m=mustName(muscle,'目标肌群');if(own(copy.exerciseCatalog,exerciseId))throw Error('动作ID重复');
 if(!['reps','seconds'].includes(unit))throw Error('动作单位不合法');
 if(videoUrl){let u;try{u=new URL(videoUrl)}catch{}if(!u||u.protocol!=='https:'||!['bilibili.com','www.bilibili.com','m.bilibili.com','b23.tv'].includes(u.hostname))throw Error('教学链接只支持 HTTPS B站地址')}
 copy.exerciseCatalog[exerciseId]={exerciseId,name:n,muscle:m,unit,origin:'user',description:tidy(description,300),videoUrl:tidy(videoUrl,600),createdAt:iso()};return updated(copy);
}
export function editCustomExercise(doc,exerciseId,fields={}){
 const copy=clone(doc),e=copy.exerciseCatalog[exerciseId];if(!e||e.origin!=='user')throw Error('只能编辑用户自建动作');
 if(fields.name!==undefined)e.name=mustName(fields.name,'动作名称');
 if(fields.muscle!==undefined)e.muscle=mustName(fields.muscle,'目标肌群');
 if(fields.description!==undefined)e.description=tidy(fields.description,300);
 return updated(copy);
}
export function deleteCustomExercise(doc,exerciseId){
 const copy=clone(doc),e=copy.exerciseCatalog[exerciseId];if(!e||e.origin!=='user')throw Error('只能删除用户自建动作');
 if(Object.values(copy.programs).some(p=>p.days.some(d=>d.exercises.some(x=>x.exerciseId===exerciseId))))throw Error('动作正在被训练计划使用，请先从所有计划移除');
 if(Object.values(copy.sessions).some(s=>s.exerciseSnapshot.some(x=>x.exerciseId===exerciseId)))throw Error('动作有关联历史训练，不允许删除');
 delete copy.exerciseCatalog[exerciseId];return updated(copy);
}
export function programSummary(doc){return Object.values(doc.programs).map(p=>({id:p.programId,name:p.name,split:p.splitCount,days:p.days.length,exercises:p.days.reduce((n,d)=>n+d.exercises.length,0),active:p.programId===doc.activeProgramId,archived:!!p.archived}));}
