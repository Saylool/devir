import { z } from 'zod';

export const TaskInputSchema = z.object({
  title:z.string().trim().min(3).max(100),
  budget:z.number().min(50).max(10000).multipleOf(0.01),
  serviceBudget:z.number().min(0.1).max(100).multipleOf(0.01),
  deadlineMinutes:z.number().int().min(2).max(120),
  maxSlippageBps:z.number().int().min(5).max(500),
  priority:z.enum(['balanced','speed','cost']),
  engine:z.enum(['rules','llm']),
}).strict();
export type TaskInput=z.infer<typeof TaskInputSchema>;
export type Phase='running'|'interrupted'|'recovering'|'ready'|'transferred'|'completed'|'blocked'|'cancelled';
export type Scenario='disconnect'|'lost-response'|'limit-breach';
export type Market={instrument:'AVAX-USDT';price:number;bid:number;ask:number;asks:[number,number][];bids:[number,number][];sourceTime:number;receivedAt:number;source:'atk-core'|'atk-recording';stale:boolean;tools:string[];error?:string};
export type AgentId='atlas'|'nova'|'pulse'|'vega';
export type Agent={id:AgentId;name:string;tag:string;description:string;shape:'grid'|'orbit'|'wave'|'diamond';color:string;feeBase:number;feeRate:number;seconds:number};
export type Bid={agentId:AgentId;feeCents:number;originalFeeCents:number;etaSeconds:number;eligible:boolean;reason:string;negotiated:boolean;score:number};
export type Fill={id:string;agentId:AgentId;epoch:number;spentCents:number;quantity:number;price:number;at:string;acknowledged:boolean};
export type Trace={id:string;at:string;kind:'goal'|'tool'|'decision'|'warning'|'success';tool:string;title:string;detail:string;data?:unknown};
export type Task={id:string;shortId:string;input:TaskInput;phase:Phase;scenario:Scenario;createdAt:string;updatedAt:string;deadlineAt:number;revision:number;epoch:number;activeAgent:AgentId;market:Market;referencePrice:number;maxPrice:number;budgetCents:number;serviceBudgetCents:number;spentCents:number;knownSpentCents:number;originalEarnedCents:number;successorFeeCents:number;fills:Fill[];oldOrderOpen:boolean;bids:Bid[];selectedAgent:AgentId|null;quoteExpiresAt:number;trace:Trace[];decision:string;checkpointHash:string;completedAt:string|null;engine:'rules'|'llm';model?:string};
export const AGENTS:Agent[]=[
 {id:'atlas',name:'Atlas',tag:'İlk yürütücü',description:'Görevi başlatır, kısmi gerçekleşmeleri kaydeder.',shape:'grid',color:'#33363d',feeBase:0,feeRate:0,seconds:0},
 {id:'nova',name:'Nova',tag:'Hız odaklı',description:'Kısa sürede devralır. Dar teslim aralıklarına uygundur.',shape:'orbit',color:'#2458ed',feeBase:80,feeRate:0.001,seconds:18},
 {id:'pulse',name:'Pulse',tag:'Dengeli',description:'Teslim süresi ile hizmet bedelini dengeler.',shape:'wave',color:'#aa5a2d',feeBase:54,feeRate:0.0008,seconds:35},
 {id:'vega',name:'Vega',tag:'Maliyet odaklı',description:'Daha geniş sürede, daha düşük ücretle tamamlar.',shape:'diamond',color:'#6953a0',feeBase:34,feeRate:0.0006,seconds:90},
];
export const DEFAULT_INPUT:TaskInput={title:'AVAX alım görevi',budget:500,serviceBudget:3,deadlineMinutes:15,maxSlippageBps:100,priority:'balanced',engine:'rules'};
export const agentById=(id:AgentId)=>AGENTS.find(a=>a.id===id)!;
export const money=(cents:number)=>new Intl.NumberFormat('tr-TR',{minimumFractionDigits:2,maximumFractionDigits:2}).format(cents/100);
