export const runtime = 'nodejs';
export const maxDuration = 60;
import { TaskInputSchema } from '@/lib/devir/types';
import { createTask } from '@/lib/devir/engine';
import { modelConfigured } from '@/lib/devir/agent';
import { readDevirMarket } from '@/lib/devir/market';
import { insertTask, listTasks } from '@/lib/devir/store';
import { apiError, HttpError, ownerId, readJson } from '@/lib/http';
export async function GET(){try{return Response.json(await listTasks(await ownerId()),{headers:{'Cache-Control':'private, no-store'}});}catch(e){return apiError(e);}}
export async function POST(request:Request){try{const owner=await ownerId(),input=TaskInputSchema.parse(await readJson(request));if(input.engine==='llm'&&!modelConfigured())throw new HttpError(409,'LLM bağlantısı yapılandırılmadı.');const task=createTask(input,await readDevirMarket());return Response.json(await insertTask(owner,task),{status:201,headers:{'Cache-Control':'no-store'}});}catch(e){return apiError(e);}}
