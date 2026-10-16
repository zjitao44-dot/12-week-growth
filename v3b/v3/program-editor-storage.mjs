/** V3-B only: atomic saves to the independent V3 database, never touches V2 storage. */
import {clone,validateV3,verifyMigration} from './migrate-core.mjs';
import {openV3Database,readV3} from './browser-adapter.mjs';
const request=(r)=>new Promise((resolve,reject)=>{r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error||Error('读取数据库失败'))});
const end=(tx)=>new Promise((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error||Error('数据库写入中断'));tx.onerror=()=>reject(tx.error||Error('数据库写入失败'))});
export const readEditor=readV3;
export async function readEditorBackup(key='v3-editor-previous'){
 const db=await openV3Database();try{const tx=db.transaction('backups','readonly'),done=end(tx);const backup=await request(tx.objectStore('backups').get(key));await done;return backup||null}finally{db.close()}
}
/** Update state and V3 rollback copies in one transaction. Reject stale concurrent tabs. */
export async function saveEditor(next,{expectedRevision,reason='修改训练计划'}={}){
 validateV3(next);const db=await openV3Database();try{
 const tx=db.transaction(['state','backups','meta'],'readwrite'),done=end(tx);
 const current=await request(tx.objectStore('state').get('main'));
 if(!current?.migration?.completed){tx.abort();await done.catch(()=>{});throw Error('找不到V3迁移记录，请先完成V3.0-A数据迁移')}
 // V3-B must not rewrite migrated V2 records or historical sessions.
 for(const key of ['legacyRaw','days','workouts','review','learn','videos','sessions']){
  if(JSON.stringify(next[key])!==JSON.stringify(current[key])){tx.abort();await done.catch(()=>{});throw Error(`安全校验失败：V3-B不能修改原有 ${key} 数据`)}
 }
 const actual=Number(current.editorRevision)||0;
 if(expectedRevision!==undefined&&actual!==Number(expectedRevision)){tx.abort();await done.catch(()=>{});throw Error('检测到另一标签页更新了计划。请刷新读取新版本，避免覆盖其他修改。')}
 const state=clone(next);state.editorRevision=actual+1;state.editorMeta={...(state.editorMeta||{}),lastModifiedAt:new Date().toISOString(),reason};
 validateV3(state);
 // Preserve first-ever editor snapshot, plus a rollback snapshot for the most recent change.
 const backups=tx.objectStore('backups');
 const first=await request(backups.get('v3-editor-baseline'));
 if(!first)backups.put({time:new Date().toISOString(),reason:'编辑器首次修改前（长期基线）',data:clone(current)},'v3-editor-baseline');
 backups.put({time:new Date().toISOString(),reason:'上次修改前',data:clone(current)},'v3-editor-previous');
 tx.objectStore('state').put(state,'main');
 tx.objectStore('meta').put({revision:state.editorRevision,updatedAt:state.editorMeta.lastModifiedAt,reason},'editor');
 await done;
 return state;
 }finally{db.close()}
}
export async function restorePrevious({expectedRevision}={}){
 const current=await readV3(),backup=await readEditorBackup();if(!backup?.data)throw Error('没有可恢复的上一版本');
 const copy=clone(backup.data);validateV3(copy);return saveEditor(copy,{expectedRevision:expectedRevision??(Number(current?.editorRevision)||0),reason:'恢复上一个V3编辑版本'});
}
export async function importEditorJSON(raw,{expectedRevision}={}){
 const doc=clone(raw);validateV3(doc);
 if(!doc.migration?.completed)throw Error('文件不是有效的V3迁移数据');
 const current=await readV3();if(!current)throw Error('没有现有V3数据库，先在V3.0-A中迁移');
 // Always keep local original legacy history; do not accept an imported dataset lacking those sessions.
 if(JSON.stringify(doc.legacyRaw)!==JSON.stringify(current.legacyRaw))throw Error('导入文件与本机V2原始备份不一致，已拒绝恢复');
 const have=Object.keys(current.sessions||{}).filter(k=>k.startsWith('legacy:'));
 if(have.some(id=>JSON.stringify(doc.sessions?.[id]?.legacyRaw)!==JSON.stringify(current.sessions[id]?.legacyRaw)))throw Error('导入数据中的原有V2历史训练与本机记录不一致，已拒绝覆盖；请先备份并人工核对');
 return saveEditor(doc,{expectedRevision:expectedRevision??(Number(current.editorRevision)||0),reason:'恢复V3 JSON备份'});
}

/** Recovery-only bootstrap for a blank localhost origin; never touches V2 or overwrites a V3 dataset. */
export async function initializeV3FromBackup(raw){
 const doc=clone(raw);validateV3(doc);
 if(!doc.legacyRaw||!verifyMigration(doc.legacyRaw,doc).passed)throw Error('备份与原始V2迁移记录无法完整核对，已停止导入');
 const db=await openV3Database();try{
  const tx=db.transaction(['state','backups','meta'],'readwrite'),done=end(tx);
  const current=await request(tx.objectStore('state').get('main'));
  if(current){tx.abort();await done.catch(()=>{});throw Error('已有V3数据库，禁止通过初始化操作覆盖')}
  tx.objectStore('state').put(doc,'main');
  tx.objectStore('backups').put({time:new Date().toISOString(),reason:'使用V3 JSON在本机恢复',data:clone(doc)},'v3-restored-from-file');
  tx.objectStore('backups').put({time:new Date().toISOString(),source:'import-v3',data:clone(doc.legacyRaw)},'v2-selected');
  tx.objectStore('meta').put({status:'completed',source:'import-v3-json',at:new Date().toISOString()},'migration');
  await done;return doc;
 }finally{db.close()}
}
