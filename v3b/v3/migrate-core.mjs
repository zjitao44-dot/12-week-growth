/** 12W SPORT V3-A — pure, deterministic migration model. No browser/global storage writes. */
export const V2_STORE = 'rebuild12w-local-v1';
export const V2_DB_NAME = 'rebuild12w-pwa-db';
export const V3_DB_NAME = 'rebuild12w-v3b-web-preview-db';
export const V3_SCHEMA_VERSION = 3;
export const LEGACY_PROGRAM_ID = 'program:v2-four-split';
export const CUSTOM_PROGRAM_ID = 'program:my-four-split';

/** Stable V2 action IDs (23); do not rename. Every entry: id, name, sets, target, muscle. */
export const SYSTEM_DAYS = {
  A: { name:'胸部＋肱三头肌', muscles:['胸部','三头肌'], items:[
    ['flat','平板哑铃卧推',3,'8–12'],['incline','上斜哑铃卧推',3,'8–12'],['fly','绳索夹胸',2,'12–15'],
    ['push','绳索下压',3,'10–15'],['over','绳索过顶臂屈伸',2,'10–15']]},
  B: { name:'背部＋肱二头肌', muscles:['背部','二头肌'], items:[
    ['pulldown','高位下拉',3,'8–12'],['row','胸托划船',3,'8–12'],['cable','单臂绳索划船',2,'10–12'],
    ['rear','反向蝴蝶机飞鸟',2,'12–15'],['curl','哑铃弯举',3,'10–12'],['hammer','锤式弯举',2,'10–15']]},
  C: { name:'腿部＋臀部', muscles:['腿部','臀部'], items:[
    ['squat','史密斯深蹲 / 腿举',3,'8–12'],['rdl','罗马尼亚硬拉',3,'8–10'],
    ['split','保加利亚分腿蹲',2,'每侧8–10'],['legcurl','坐姿腿弯举',3,'10–15'],
    ['hip','臀推',2,'10–12'],['calf','站姿提踵',3,'12–15']]},
  D: { name:'肩部＋腹部', muscles:['肩部','核心'], items:[
    ['press','坐姿哑铃肩推',3,'8–12'],['lateral','哑铃侧平举',3,'12–15'],
    ['latcable','绳索侧平举',2,'12–15'],['rear2','反向蝴蝶机飞鸟',2,'12–15'],
    ['abs','绳索卷腹',3,'12–15'],['plank','平板支撑',2,'30–45秒']]}
};
export const MY_FOUR_SPLIT = [
  {name:'胸部＋三头', muscles:['胸部','三头肌'], ids:['flat','incline','fly']},
  {name:'背部＋二头', muscles:['背部','二头肌'], ids:['pulldown','row','curl']},
  {name:'腿部＋臀部', muscles:['腿部','臀部'], ids:['squat','rdl']},
  {name:'肩部＋核心', muscles:['肩部','核心'], ids:['lateral','press','abs']}
];
const v2ById = Object.fromEntries(Object.values(SYSTEM_DAYS).flatMap(d=>d.items).map(x=>[x[0],x]));
const allKeys = ['days','workouts','review','learn','videos'];
const own = (o,k)=>Object.prototype.hasOwnProperty.call(o,k);
export const clone = obj=>JSON.parse(JSON.stringify(obj));
export function assertObject(value,label='value'){
  if(!value || typeof value!=='object'||Array.isArray(value))throw new Error(`${label} 必须是普通对象`);
}
function recordsOrEmpty(source,k){const value=source[k]; if(value==null)return {}; assertObject(value,k);return clone(value)}
function assertSafeKeys(o,label){for(const key of Object.keys(o))if(['__proto__','prototype','constructor'].includes(key))throw new Error(`${label} 含无效字段名`)}
export function validateV2(raw){
  assertObject(raw,'V2备份');
  if(raw.version!==1)throw new Error('源数据不是V2 version:1');
  for(const k of allKeys){if(raw[k]!=null){assertObject(raw[k],k);assertSafeKeys(raw[k],k)}}
  for(const [date,record] of Object.entries(raw.days||{})){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date))throw new Error(`日期格式无效：${date}`);
    assertObject(record,`days.${date}`);
  }
  for(const [date,record] of Object.entries(raw.workouts||{})){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date))throw new Error(`训练日期格式无效：${date}`);
    assertObject(record,`workouts.${date}`);
    if(record.exercises!=null){assertObject(record.exercises,`workouts.${date}.exercises`);for(const [id,detail] of Object.entries(record.exercises)){assertObject(detail,`workouts.${date}.exercises.${id}`);if(detail.sets!=null&&!Array.isArray(detail.sets))throw new Error(`动作 ${id} 的 sets 不是数组`)}}
  }
  return true;
}
function stableObject(value){
  if(Array.isArray(value))return value.map(stableObject);
  if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,stableObject(value[k])]));
  return value;
}
export const canonical = obj=>JSON.stringify(stableObject(obj));
export function equalPayload(a,b){return canonical(a)===canonical(b)}
/** Conflict is *not* resolved automatically at equal timestamps. Explicit choice is required. */
export function chooseV2Source(local,database,preferred=null){
  const candidates=[];
  if(local){validateV2(local);candidates.push({key:'localStorage',data:local})}
  if(database){validateV2(database);candidates.push({key:'IndexedDB',data:database})}
  if(!candidates.length)return {source:'empty',data:{version:1,days:{},workouts:{},review:{},learn:{},videos:{}},status:'empty'};
  if(candidates.length===1)return {source:candidates[0].key,data:clone(candidates[0].data),status:'single'};
  const [a,b]=candidates;
  if(equalPayload(a.data,b.data))return {source:a.key,data:clone(a.data),status:'equal'};
  const at=Number(a.data.__savedAt)||0, bt=Number(b.data.__savedAt)||0;
  if(at!==bt)return {source:at>bt?a.key:b.key,data:clone(at>bt?a.data:b.data),status:'newer',other:at>bt?b.key:a.key};
  if(preferred){const chosen=candidates.find(x=>x.key===preferred);if(!chosen)throw new Error('无效来源选择');return {source:chosen.key,data:clone(chosen.data),status:'explicit-conflict-choice',other:chosen.key===a.key?b.key:a.key}}
  return {source:null,data:null,status:'conflict',message:'本地两份V2数据时间相同但内容不同，必须明确选择来源；迁移前应分别下载两份备份。',candidates:candidates.map(x=>({source:x.key,summary:summarizeV2(x.data)}))};
}
function targetFromLegacy(str){
  const s=String(str);const range=s.match(/(\d+)\s*[–-]\s*(\d+)/);
  if(!range)return {min:8,max:12,unit:'reps',perSide:false};
  return {min:Number(range[1]),max:Number(range[2]),unit:s.includes('秒')?'seconds':'reps',perSide:s.includes('每侧')};
}
function plannedEntry(id,dayLetter,index){
  const raw=v2ById[id];if(!raw)throw new Error('未知V2动作ID: '+id);
  return {entryId:`entry:${dayLetter}:${index+1}`,exerciseId:`sys:${id}`,targetSets:raw[2],targetReps:targetFromLegacy(raw[3]),targetRIR:2,restSeconds:90,sortIndex:index};
}
export function createLegacyProgram(){return {programId:LEGACY_PROGRAM_ID,name:'原始四分化 · V2',splitCount:4,revision:1,archived:false,scheduleMode:'fixedWeekdays',fixedWeekdays:{1:'day:A',2:'day:B',4:'day:C',6:'day:D'},days:Object.entries(SYSTEM_DAYS).map(([letter,def])=>({dayId:`day:${letter}`,name:def.name,muscleGroups:clone(def.muscles),exercises:def.items.map(([id],i)=>plannedEntry(id,letter,i))}))};}
export function createUserProgram(){return {programId:CUSTOM_PROGRAM_ID,name:'我的四分化计划',splitCount:4,revision:1,archived:false,scheduleMode:'fixedWeekdays',fixedWeekdays:{1:'day:A',2:'day:B',4:'day:C',6:'day:D'},days:MY_FOUR_SPLIT.map((def,i)=>{const letter='ABCD'[i];return {dayId:`day:${letter}`,name:def.name,muscleGroups:clone(def.muscles),exercises:def.ids.map((id,j)=>plannedEntry(id,letter,j))};})};}
function validWorkoutContent(w){
  if(w.completed===true||w.duration!==undefined&&w.duration!==''||w.feeling!==undefined&&w.feeling!==''||w.note)return true;
  return Object.values(w.exercises||{}).some(e=>e.rir!==undefined&&e.rir!==''||Array.isArray(e.sets)&&e.sets.some(s=>s&&typeof s==='object'&&Object.values(s).some(x=>x!==''&&x!=null&&x!==false)));
}
export function summarizeV2(v2){
  const workouts=v2.workouts||{};
  return {days:Object.keys(v2.days||{}).length,workouts:Object.keys(workouts).filter(d=>validWorkoutContent(workouts[d])).length,completedWorkouts:Object.values(workouts).filter(w=>w.completed===true).length,sets:Object.values(workouts).reduce((n,w)=>n+Object.values(w.exercises||{}).reduce((m,e)=>m+(e.sets||[]).filter(s=>s&&Object.keys(s).length).length,0),0),learn:Object.keys(v2.learn||{}).length,videos:Object.keys(v2.videos||{}).length,review:Object.keys(v2.review||{}).length};
}
export function migrateV2(raw,{now='2026-10-16T00:00:00.000Z',source='manual'}={}){
  validateV2(raw);
  const legacy=clone(raw);
  const retained=Object.fromEntries(allKeys.map(k=>[k,recordsOrEmpty(raw,k)]));
  const catalog=Object.fromEntries(Object.entries(v2ById).map(([id,v])=>[`sys:${id}`,{exerciseId:`sys:${id}`,name:v[1],origin:'v2-system',unit:id==='plank'?'seconds':'reps'}]));
  const sessions={};
  for(const [date,w] of Object.entries(retained.workouts).sort(([a],[b])=>a.localeCompare(b))){
    if(!validWorkoutContent(w))continue;
    const type=String(w.type||'');
    const reference=/^[ABCD]$/.test(type)?SYSTEM_DAYS[type].items.map(x=>x[0]):[];
    const allIds=[...new Set([...reference,...Object.keys(w.exercises||{})])];
    const entries=allIds.filter(id=>own(w.exercises||{},id)).map((id,index)=>{
      const ex=w.exercises[id];
      const def=v2ById[id];
      const prescription=def?{targetSets:def[2],targetReps:targetFromLegacy(def[3])}:null;
      return {entryId:`legacy-entry:${date}:${id}`,exerciseId:def?`sys:${id}`:`legacy-unknown:${id}`,legacyExerciseId:id,name:def?def[1]:String(id),sortIndex:index,prescription,actualSets:clone(ex.sets||[]),actualRIR:ex.rir??null,legacyRaw:clone(ex)};
    });
    sessions[`legacy:${date}`]={sessionId:`legacy:${date}`,date,source:'v2',legacyDate:date,programId:LEGACY_PROGRAM_ID,programRevision:1,dayId:/^[ABCD]$/.test(type)?`day:${type}`:null,legacyType:w.type??null,completed:w.completed===true,duration:w.duration??null,feeling:w.feeling??null,note:w.note??'',exerciseSnapshot:entries,legacyRaw:clone(w)};
  }
  const result={schemaVersion:V3_SCHEMA_VERSION,legacyVersion:1,...retained,exerciseCatalog:catalog,programs:{[LEGACY_PROGRAM_ID]:createLegacyProgram(),[CUSTOM_PROGRAM_ID]:createUserProgram()},activeProgramId:CUSTOM_PROGRAM_ID,schedule:{mode:'fixedWeekdays',effectiveFrom:'2026-10-12',programId:CUSTOM_PROGRAM_ID},calendarOverrides:{},sessions,migration:{completed:true,source,completedAt:now,legacySavedAt:raw.__savedAt??null,summaryBefore:summarizeV2(raw)},legacyRaw:legacy};
  validateV3(result);
  return result;
}
export function summarizeV3(v3){
  return {days:Object.keys(v3.days||{}).length,workouts:Object.keys(v3.sessions||{}).length,completedWorkouts:Object.values(v3.sessions||{}).filter(x=>x.completed===true).length,sets:Object.values(v3.sessions||{}).reduce((n,s)=>n+s.exerciseSnapshot.reduce((t,e)=>t+e.actualSets.filter(x=>x&&Object.keys(x).length).length,0),0),learn:Object.keys(v3.learn||{}).length,videos:Object.keys(v3.videos||{}).length,review:Object.keys(v3.review||{}).length};
}
export function validateV3(doc){
  assertObject(doc,'V3');if(doc.schemaVersion!==3)throw new Error('V3架构版本错误');
  for(const k of [...allKeys,'sessions','programs','exerciseCatalog'])assertObject(doc[k],k);
  const selected=doc.programs[doc.activeProgramId];if(!selected)throw new Error('激活的计划不存在');
  for(const plan of Object.values(doc.programs)){
    if(plan.splitCount<2||plan.splitCount>6)throw new Error('分化数量不在2–6范围');
    if(plan.days.length!==plan.splitCount)throw new Error('训练日数量不匹配');
    const dayIds=new Set();const entryIds=new Set();
    for(const day of plan.days){if(dayIds.has(day.dayId))throw new Error('训练日ID重复');dayIds.add(day.dayId);
      for(const item of day.exercises){if(entryIds.has(item.entryId))throw new Error('同一计划动作entryId重复');entryIds.add(item.entryId);if(!doc.exerciseCatalog[item.exerciseId])throw new Error('训练动作不存在');if(!Number.isInteger(item.targetSets)||item.targetSets<1||item.targetSets>12)throw new Error('目标组数异常')}}
  }
  for(const [key,s] of Object.entries(doc.sessions)){if(key!==s.sessionId)throw new Error('session键不一致');if(!Array.isArray(s.exerciseSnapshot))throw new Error('session快照无效')}
  if(!doc.migration?.completed)throw new Error('迁移完成标记缺失');
  return true;
}
export function verifyMigration(v2,v3){
  validateV2(v2);validateV3(v3);
  const a=summarizeV2(v2),b=summarizeV3(v3),issues=[];
  for(const [key,value] of Object.entries(a))if(value!==b[key])issues.push(`${key}: ${value} → ${b[key]}`);
  for(const key of allKeys)if(!equalPayload(v2[key]||{},v3[key]||{}))issues.push(`原始数据 ${key} 不一致`);
  if(!equalPayload(v2,v3.legacyRaw))issues.push('完整原始快照不一致');
  for(const [date,w] of Object.entries(v2.workouts||{})){
    const s=v3.sessions[`legacy:${date}`];if(validWorkoutContent(w)&&(!s||!equalPayload(w,s.legacyRaw)))issues.push(`训练 ${date} 的原始快照不一致`);
  }
  return {passed:!issues.length,issues,before:a,after:b};
}
export function sessionsInRange(v3,start,end){const arr=Object.values(v3.sessions).filter(s=>s.date>=start&&s.date<=end);return {sessionCount:arr.length,trainingDays:new Set(arr.map(s=>s.date)).size,completedSessions:arr.filter(s=>s.completed).length};}
