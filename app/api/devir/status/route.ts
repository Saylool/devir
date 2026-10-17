export const runtime = 'nodejs';
export const maxDuration = 60;
import { modelConfigured } from '@/lib/devir/agent';
export async function GET(){return Response.json({modelReady:modelConfigured(),model:modelConfigured()?process.env.DEVIR_LLM_MODEL:null,execution:'paper',agents:'local-adapters',market:'official-atk-core',chain:'fuji-wallet',site:'tr'},{headers:{'Cache-Control':'no-store'}});}
