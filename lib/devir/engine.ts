import { keccak256, toUtf8Bytes } from 'ethers';
import { AGENTS, agentById, type AgentId, type Bid, type Fill, type Market, type Scenario, type Task, type TaskInput, type Trace } from './types';

const roundQty=(n:number)=>Math.floor(n*1e8)/1e8;
export const hashValue=(value:unknown)=>keccak256(toUtf8Bytes(JSON.stringify(value)));
export function checkpoint(task:Task){return hashValue({id:task.id,input:task.input,epoch:task.epoch,active:task.activeAgent,fills:task.fills.map(({acknowledged,...f})=>f),spent:task.spentCents,oldOrderOpen:task.oldOrderOpen});}
export function addTrace(task:Task,kind:Trace['kind'],tool:string,title:string,detail:string,data?:unknown):Trace{
 const event={id:crypto.randomUUID(),at:new Date().toISOString(),kind,tool,title,detail,...(data===undefined?{}:{data})};task.trace.push(event);return event;
}
export function estimateBuy(market:Market,cents:number,maxPrice:number):{quantity:number;price:number;fits:boolean}{
 let dollars=cents/100,quantity=0,spent=0;
 for(const [price,size] of market.asks){if(price>maxPrice)break;const take=Math.min(size,dollars/price);quantity+=take;spent+=take*price;dollars-=take*price;if(dollars<0.000001)break;}
 return {quantity:roundQty(quantity),price:quantity?spent/quantity:market.ask,fits:dollars<0.000001};
}
function makeFill(task:Task,agentId:AgentId,epoch:number,cents:number,acknowledged=true):Fill{
 const e=estimateBuy(task.market,cents,task.maxPrice);if(!e.fits)throw new Error('Fiyat sınırı içinde yeterli emir derinliği yok.');
 return {id:`paper-${crypto.randomUUID()}`,agentId,epoch,spentCents:cents,quantity:e.quantity,price:e.price,at:new Date().toISOString(),acknowledged};
}
export function createTask(input:TaskInput,market:Market):Task{
 const now=new Date().toISOString(),id=crypto.randomUUID(),budgetCents=Math.round(input.budget*100),serviceBudgetCents=Math.round(input.serviceBudget*100);
 const task:Task={id,shortId:`DVR-${id.slice(0,4).toUpperCase()}`,input,phase:'running',scenario:'disconnect',createdAt:now,updatedAt:now,deadlineAt:Date.now()+input.deadlineMinutes*60000,revision:1,epoch:1,activeAgent:'atlas',market,referencePrice:market.ask,maxPrice:market.ask*(1+input.maxSlippageBps/10000),budgetCents,serviceBudgetCents,spentCents:0,knownSpentCents:0,originalEarnedCents:0,successorFeeCents:0,fills:[],oldOrderOpen:true,bids:[],selectedAgent:null,quoteExpiresAt:0,trace:[],decision:'Atlas görevin ilk bölümünü yürütüyor.',checkpointHash:'',completedAt:null,engine:input.engine};
 const fill=makeFill(task,'atlas',1,Math.floor(budgetCents*0.35));task.fills.push(fill);task.spentCents=fill.spentCents;task.knownSpentCents=fill.spentCents;
 addTrace(task,'goal','task.create','Görev sınırları kaydedildi',`${input.budget} USDT alım bütçesi, ${input.serviceBudget} USDT hizmet sınırı ve ${input.deadlineMinutes} dakika teslim süresi.`);
 addTrace(task,market.stale?'warning':'tool','market_get_ticker + market_get_orderbook',market.stale?'Tarihli ATK kaydı kullanılıyor':'ATK piyasa verisi alındı',market.stale?'Canlı bağlantı yerine tarihli public veri. Tüm emirler yerel simülasyondur.':'Resmî ATK araçları, OKX TR public fiyatını ve emir defterini getirdi. Emir yürütme yerel simülasyondur.',{source:market.source,sourceTime:market.sourceTime});
 addTrace(task,'success','paper.place_order','Atlas ilk %35’i tamamladı','Kısmi gerçekleşme simülasyon defterine yazıldı. Kalan emir açık.',{fillId:fill.id,spentCents:fill.spentCents});task.checkpointHash=checkpoint(task);return task;
}
export function interruptTask(task:Task,scenario:Scenario){
 if(task.phase!=='running')throw new Error('Yalnız çalışan ilk agent durdurulabilir.');
 task.scenario=scenario;task.phase='interrupted';
 if(scenario==='lost-response'){const fill=makeFill(task,'atlas',1,Math.floor(task.budgetCents*0.1),false);task.fills.push(fill);}
 addTrace(task,'warning','demo.disconnect','Atlas bağlantısı kesildi',scenario==='lost-response'?'Simüle borsa %10 daha gerçekleştirdi; yanıt agent’a ulaşmadı. Son bilinen kayıt %35.':scenario==='limit-breach'?'Bu senaryoda devir fiyatı, kullanıcının sınırının üstünde sınanacak. Canlı piyasa verisi değiştirilmez.':'Yeni işlem yetkisi askıya alındı. Açık emrin durumu sorgulanmadan görev devredilemez.');
 task.decision='Son gerçekleşmeler doğrulanmayı bekliyor.';return task;
}
export function reconcileTask(task:Task){
 const ids=new Set<string>();let spent=0;for(const fill of task.fills){if(ids.has(fill.id))throw new Error('Tekrarlanan gerçekleşme kaydı.');ids.add(fill.id);spent+=fill.spentCents;fill.acknowledged=true;}
 if(spent>task.budgetCents)throw new Error('Gerçekleşen tutar bütçeyi aşıyor.');
 const discovered=spent-task.knownSpentCents;task.spentCents=spent;task.knownSpentCents=spent;task.originalEarnedCents=Math.floor(task.serviceBudgetCents*spent/task.budgetCents);task.oldOrderOpen=false;
 addTrace(task,'tool','paper.get_order + paper.get_fills','Kalan iş doğrulandı',discovered>0?`Yanıtı kaybolan ${(discovered/100).toFixed(2)} USDT gerçekleşme bulundu. Bu tutar tekrar yürütülmeyecek.`:'Gerçekleşmeler ile görev kaydı eşleşiyor. Tamamlanan iş korunuyor.',{spentCents:spent,discoveredCents:discovered,source:'local-paper-exchange'});
 addTrace(task,'tool','paper.cancel_remainder','Eski emrin kalanı kapatıldı','Atlas’ın açık emri simülasyonda iptal edildi. Aynı bütçe iki yürütücüde aktif değil.');
 task.checkpointHash=checkpoint(task);
}
export function makeBid(task:Task,id:AgentId,discount=false):Bid{
 if(id==='atlas')throw new Error('Kesilen agent yeniden teklif veremez.');const agent=agentById(id),remaining=task.budgetCents-task.spentCents;
 const originalFeeCents=agent.feeBase+Math.round(remaining*agent.feeRate),feeCents=discount?Math.ceil(originalFeeCents*0.9):originalFeeCents;
 const effectivePrice=task.scenario==='limit-breach'?task.maxPrice*1.02:task.market.ask;
 let reason='Bütçe, fiyat sınırı ve süre uygun.';
 if(Date.now()+agent.seconds*1000>task.deadlineAt)reason='Kalan teslim süresini aşıyor.';
 else if(feeCents>task.serviceBudgetCents-task.originalEarnedCents)reason='Kalan hizmet bütçesini aşıyor.';
 else if(effectivePrice>task.maxPrice||!estimateBuy(task.market,remaining,task.maxPrice).fits)reason='Kullanıcının fiyat sınırı korunamıyor.';
 const score=task.input.priority==='cost'?feeCents:task.input.priority==='speed'?agent.seconds:feeCents+agent.seconds*2;
 return {agentId:id,feeCents,originalFeeCents,etaSeconds:agent.seconds,eligible:reason==='Bütçe, fiyat sınırı ve süre uygun.',reason,negotiated:discount,score};
}
export function selectBid(task:Task,requested?:AgentId){
 const eligible=task.bids.filter(b=>b.eligible).sort((a,b)=>a.score-b.score||a.feeCents-b.feeCents);const selected=requested?eligible.find(b=>b.agentId===requested):eligible[0];
 if(requested&&!selected)throw new Error('Agent, koşulları sağlamayan bir teklifi seçti.');
 task.selectedAgent=selected?.agentId??null;task.successorFeeCents=selected?.feeCents??0;task.phase=selected?'ready':'blocked';task.quoteExpiresAt=Date.now()+60000;
 task.decision=selected?`${agentById(selected.agentId).name}, ${selected.etaSeconds} saniye teslim ve ${(selected.feeCents/100).toFixed(2)} USDT hizmet teklifiyle seçildi. Tamamlanan ${(task.spentCents/task.budgetCents*100).toFixed(0)}% korunuyor.`:'Hiçbir teklif tüm sınırları sağlamıyor. Yeni emir açılmadı; kalan alım bütçesi korunuyor.';
 addTrace(task,selected?'decision':'warning','handover.validate',selected?'Devir planı hazır':'Devir durduruldu',task.decision,{selected:task.selectedAgent,remainingCents:task.budgetCents-task.spentCents});return task;
}
export function transferTask(task:Task,market:Market){
 if(task.phase!=='ready'||!task.selectedAgent||task.oldOrderOpen)throw new Error('Doğrulanmış, açık emri kapatılmış devir planı gerekli.');
 if(Date.now()>task.quoteExpiresAt)throw new Error('Teklif süresi doldu. Devir planını yenileyin.');
 task.market=market;const bid=makeBid(task,task.selectedAgent,!!task.bids.find(b=>b.agentId===task.selectedAgent)?.negotiated);if(!bid.eligible)throw new Error(bid.reason);
 task.epoch+=1;task.activeAgent=task.selectedAgent;task.phase='transferred';task.checkpointHash=checkpoint(task);
 addTrace(task,'success','lease.transfer',`Görev ${agentById(task.activeAgent).name} agent’ına devredildi`,`Yetki sürümü ${task.epoch}. Atlas’ın önceki sürümle yeni işlem yapması reddedilir.`,{checkpoint:task.checkpointHash});return task;
}
export function completeTask(task:Task,market:Market,actor:AgentId,epoch:number){
 if(task.phase!=='transferred'||actor!==task.activeAgent||epoch!==task.epoch)throw new Error('Bu agent veya yetki sürümü görevi yürütemez.');
 if(Date.now()>task.deadlineAt)throw new Error('Görevin teslim süresi doldu.');task.market=market;
 const remainder=task.budgetCents-task.spentCents;if(remainder<=0)throw new Error('Görev daha önce tamamlandı.');
 const fill=makeFill(task,actor,epoch,remainder);task.fills.push(fill);task.spentCents+=remainder;task.knownSpentCents=task.spentCents;task.phase='completed';task.completedAt=new Date().toISOString();task.checkpointHash=checkpoint(task);
 const fees=task.originalEarnedCents+task.successorFeeCents;if(fees>task.serviceBudgetCents)throw new Error('Hizmet bütçesi aşılamaz.');
 task.decision='Görev tamamlandı. İlk agent’ın işi korundu; yalnız kalan tutar yürütüldü.';
 addTrace(task,'success','paper.execute_remainder','Kalan iş tamamlandı',`${(remainder/100).toFixed(2)} USDT simüle alım, ${fill.quantity.toFixed(6)} AVAX. Tekrarlanan harcama: 0.`,{fillId:fill.id,epoch});
 addTrace(task,'success','receipt.seal','Devir fişi oluşturuldu',`Toplam ${(task.spentCents/100).toFixed(2)} USDT alım, ${(fees/100).toFixed(2)} USDT hizmet bedeli. Zincir kaydı cüzdan onayıyla ayrıca yapılır.`,{hash:task.checkpointHash});return task;
}
export function cancelTask(task:Task){if(['completed','cancelled'].includes(task.phase))throw new Error('Kapanmış görev değiştirilemez.');reconcileTask(task);task.phase='cancelled';task.decision='Görev durduruldu. Gerçekleşen kısım korundu; kalan simülasyon bütçesi serbest.';addTrace(task,'decision','task.cancel','Görev kapatıldı',task.decision);task.checkpointHash=checkpoint(task);return task;}
export function integrity(task:Task){return {withinBudget:task.spentCents<=task.budgetCents,uniqueFills:new Set(task.fills.map(f=>f.id)).size===task.fills.length,accounted:task.spentCents===task.fills.filter(f=>f.acknowledged).reduce((s,f)=>s+f.spentCents,0),feesWithinBudget:task.originalEarnedCents+task.successorFeeCents<=task.serviceBudgetCents};}
