export const runtime = 'nodejs';
export const maxDuration = 60;
import { z } from 'zod';
import { addTrace, cancelTask, completeTask, interruptTask, transferTask } from '@/lib/devir/engine';
import { recoverTask } from '@/lib/devir/agent';
import { readDevirMarket } from '@/lib/devir/market';
import { loadTask, saveTask } from '@/lib/devir/store';
import { apiError, HttpError, ownerId, readJson } from '@/lib/http';
type Context={params:Promise<{id:string}>};
export async function GET(_:Request,{params}:Context){try{return Response.json(await loadTask((await params).id,await ownerId()),{headers:{'Cache-Control':'private, no-store'}});}catch(e){return apiError(e);}}
const ActionSchema=z.object({action:z.enum(['interrupt','recover','transfer','complete','cancel']),revision:z.number().int().positive(),scenario:z.enum(['disconnect','lost-response','limit-breach']).optional()}).strict();
export async function PATCH(request:Request,{params}:Context){
 try{
  const owner=await ownerId(),{id}=await params,input=ActionSchema.parse(await readJson(request));let task=await loadTask(id,owner);
  if(task.revision!==input.revision)throw new HttpError(409,'Görev değişti. Güncel kaydı açın.');
  if(input.action==='recover'){
   if(!['interrupted','ready','blocked'].includes(task.phase)&&!(task.phase==='recovering'&&Date.now()-Date.parse(task.updatedAt)>90000))throw new HttpError(409,'Bu görev şu anda yeniden planlanamaz.');
   task.phase='recovering';task=await saveTask(owner,task,task.revision);const expected=task.revision;
   let cancelled=false;const encoder=new TextEncoder();return new Response(new ReadableStream({cancel(){cancelled=true;},async start(controller){
    const send=(value:unknown)=>{if(!cancelled){try{controller.enqueue(encoder.encode(JSON.stringify(value)+'\n'));}catch{cancelled=true;}}};
    try{send({type:'task',task});const result=await recoverTask(task,event=>send({type:'trace',event}));send({type:'task',task:await saveTask(owner,result,expected)});}
    catch(e){task.phase='blocked';task.decision=e instanceof Error?e.message:'Devir tamamlanamadı.';addTrace(task,'warning','recovery.error','Devir planı oluşturulamadı',task.decision);try{send({type:'task',task:await saveTask(owner,task,expected)});}catch{}send({type:'error',error:task.decision});}
    finally{if(!cancelled)controller.close();}
   }}),{headers:{'Content-Type':'application/x-ndjson','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
  }
  if(input.action==='interrupt')interruptTask(task,input.scenario??'disconnect');
  if(input.action==='transfer')transferTask(task,await readDevirMarket());
  if(input.action==='complete')completeTask(task,await readDevirMarket(),task.activeAgent,task.epoch);
  if(input.action==='cancel')cancelTask(task);
  return Response.json(await saveTask(owner,task,input.revision),{headers:{'Cache-Control':'no-store'}});
 }catch(e){return apiError(e);}
}
