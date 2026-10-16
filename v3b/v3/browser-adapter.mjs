/** V3 staging-only IndexedDB adapter. Never updates/deletes V2. */
import {V2_STORE,V2_DB_NAME,V3_DB_NAME,validateV2,validateV3,chooseV2Source,migrateV2,verifyMigration,clone} from './migrate-core.mjs';
const V2_OBJECT_STORE='records',V3_STATE='state',V3_BACKUPS='backups',V3_META='meta';
const ONE='main';

function requestValue(req){return new Promise((resolve,reject)=>{req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error||new Error('数据库请求失败'))});}
function txnEnd(tx){return new Promise((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error||new Error('数据库事务失败'));tx.onabort=()=>reject(tx.error||new Error('数据库事务已中断'))});}
async function openDb(name,version,upgrade){
 return new Promise((resolve,reject)=>{const r=indexedDB.open(name,version);r.onupgradeneeded=()=>upgrade?.(r.result,r.transaction);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.onblocked=()=>reject(new Error('另一页面仍在使用数据库，请关闭其他标签页'))});
}
export async function readV2Sources(){
 let local=null,dbValue=null,errors=[];
 try{const raw=localStorage.getItem(V2_STORE);if(raw)local=JSON.parse(raw)}catch(e){errors.push('本地存储无法解析：'+e.message)}
 try{
   // The legacy database is opened *read only*; if it does not exist, do not create it when databases() is supported.
   const names=typeof indexedDB.databases==='function'?await indexedDB.databases():null;
   if(!names||names.some(x=>x.name===V2_DB_NAME)){
     const db=await openDb(V2_DB_NAME);
     try{if(db.objectStoreNames.contains(V2_OBJECT_STORE)){const tx=db.transaction(V2_OBJECT_STORE,'readonly');const finished=txnEnd(tx);const value=await requestValue(tx.objectStore(V2_OBJECT_STORE).get(ONE));await finished;dbValue=value??null}}
     finally{db.close()}
   }
 }catch(e){errors.push('V2 IndexedDB 读取异常：'+e.message)}
 return {local,database:dbValue,errors};
}
export async function openV3Database(){return openDb(V3_DB_NAME,1,db=>{for(const k of [V3_STATE,V3_BACKUPS,V3_META])if(!db.objectStoreNames.contains(k))db.createObjectStore(k)});}
export async function readV3(){const db=await openV3Database();try{const tx=db.transaction(V3_STATE,'readonly');const finished=txnEnd(tx);const doc=await requestValue(tx.objectStore(V3_STATE).get(ONE));await finished;return doc??null}finally{db.close()}}
export async function migrateOnDevice({preferred=null,backupInput=null,now=new Date().toISOString()}={}){
 // If V3 is already established, return it before reading potentially divergent later V2 copies.
 try{const present=typeof indexedDB.databases==='function' ? (await indexedDB.databases()).some(x=>x.name===V3_DB_NAME) : false;
   if(present){const existing=await readV3();if(existing?.migration?.completed){validateV3(existing);return {status:'already-migrated',data:existing,report:verifyMigration(existing.legacyRaw,existing)}}}
 }catch(e){throw new Error('现有V3记录校验失败，停止迁移：'+e.message)}
 const actual=backupInput?{local:backupInput,database:null,errors:[]} : await readV2Sources();
 if(actual.errors.length)throw new Error(actual.errors.join('；'));
 const chosen=chooseV2Source(actual.local,actual.database,preferred);
 if(chosen.status==='conflict')return {status:'conflict',...chosen};
 validateV2(chosen.data);
 const sourceName=backupInput?'imported-json':chosen.source;
 const doc=migrateV2(chosen.data,{now,source:sourceName});
 const report=verifyMigration(chosen.data,doc);
 if(!report.passed)throw new Error('迁移核对失败：'+report.issues.join('、'));
 const db=await openV3Database();
 try{
   const tx=db.transaction([V3_STATE,V3_BACKUPS,V3_META],'readwrite');const finished=txnEnd(tx);
   const current=await requestValue(tx.objectStore(V3_STATE).get(ONE));
   if(current?.migration?.completed){await finished;validateV3(current);return {status:'already-migrated',report:verifyMigration(current.legacyRaw,current),data:current}}
   const state=tx.objectStore(V3_STATE), backups=tx.objectStore(V3_BACKUPS), meta=tx.objectStore(V3_META);
   // Raw V2 input and both conflicting candidates are preserved atomically, with no modifications to legacy sources.
   backups.put({source:sourceName,data:clone(chosen.data),time:now},'v2-selected');
   if(actual.local)backups.put({source:'localStorage',data:clone(actual.local),time:now},'v2-local');
   if(actual.database)backups.put({source:'IndexedDB',data:clone(actual.database),time:now},'v2-indexed');
   state.put(doc,ONE);
   meta.put({status:'completed',source:sourceName,at:now,report},'migration');
   await finished;
   return {status:'migrated',data:doc,report,source:sourceName};
 }finally{db.close()}
}
export async function exportV3(){const doc=await readV3();if(!doc)throw new Error('暂无V3迁移数据');validateV3(doc);return JSON.stringify(doc,null,2)}
export async function exportLegacyBackup(){const db=await openV3Database();try{const tx=db.transaction(V3_BACKUPS,'readonly');const finished=txnEnd(tx);const result=await requestValue(tx.objectStore(V3_BACKUPS).get('v2-selected'));await finished;if(!result)throw new Error('缺少V2原始备份');return JSON.stringify(result.data,null,2)}finally{db.close()}}
export async function migrationReport(){const db=await openV3Database();try{const tx=db.transaction(V3_META,'readonly');const finished=txnEnd(tx);const report=await requestValue(tx.objectStore(V3_META).get('migration'));await finished;return report??null}finally{db.close()}}
