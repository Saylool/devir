export const runtime = 'nodejs';
export const maxDuration = 60;
import { readDevirMarket } from '@/lib/devir/market';
export async function GET(){return Response.json(await readDevirMarket(),{headers:{'Cache-Control':'no-store'}});}
