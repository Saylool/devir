import test from 'node:test';
import assert from 'node:assert/strict';
import {createTask,interruptTask,transferTask,completeTask,integrity,checkpoint,cancelTask,estimateBuy} from '../lib/devir/engine';
import {recoverTask} from '../lib/devir/agent';
import {DEFAULT_INPUT,type Market} from '../lib/devir/types';
const market=():Market=>({instrument:'AVAX-USDT',price:10,bid:9.99,ask:10,asks:[[10,1000],[10.01,1000]],bids:[[9.99,1000]],sourceTime:Date.now(),receivedAt:Date.now(),source:'atk-core',stale:false,tools:['market_get_ticker','market_get_orderbook']});
const recover=(t:ReturnType<typeof createTask>)=>recoverTask(t,()=>{},async()=>market());
test('lost response is reconciled, old order is cancelled, only remaining 55% is executed',async()=>{
 const t=createTask(DEFAULT_INPUT,market());interruptTask(t,'lost-response');assert.equal(t.knownSpentCents,17500);assert.equal(t.fills.reduce((s,f)=>s+f.spentCents,0),22500);
 await recover(t);assert.equal(t.phase,'ready');assert.equal(t.oldOrderOpen,false);assert.equal(t.spentCents,22500);assert.equal(t.selectedAgent,'nova');
 transferTask(t,market());assert.throws(()=>completeTask(t,market(),'atlas',1),/yetki/);completeTask(t,market(),t.activeAgent,2);
 assert.equal(t.spentCents,50000);assert.equal(t.fills.at(-1)?.spentCents,27500);assert.deepEqual(integrity(t),{withinBudget:true,uniqueFills:true,accounted:true,feesWithinBudget:true});assert.equal(t.checkpointHash,checkpoint(t));
 assert.throws(()=>completeTask(t,market(),t.activeAgent,2));assert.throws(()=>transferTask(t,market()));
});
test('stress-price breach blocks every bid without placing another order',async()=>{const t=createTask(DEFAULT_INPUT,market());interruptTask(t,'limit-breach');await recover(t);assert.equal(t.phase,'blocked');assert.equal(t.selectedAgent,null);assert.equal(t.fills.length,1);assert.equal(t.market.ask,10);assert.throws(()=>transferTask(t,market()));});
test('budget negotiation obtains the cheaper policy offer when initial offers do not fit',async()=>{const t=createTask({...DEFAULT_INPUT,serviceBudget:0.8,priority:'cost'},market());interruptTask(t,'disconnect');await recover(t);assert.equal(t.phase,'ready');assert.equal(t.selectedAgent,'vega');assert.ok(t.bids.find(b=>b.agentId==='vega')?.negotiated);assert.ok(integrity(t).feesWithinBudget);});
test('expiry and market repricing are checked again at handover',async()=>{const t=createTask(DEFAULT_INPUT,market());interruptTask(t,'disconnect');await recover(t);t.quoteExpiresAt=Date.now()-1;assert.throws(()=>transferTask(t,market()),/süresi/);t.quoteExpiresAt=Date.now()+60000;const high={...market(),ask:12,asks:[[12,1000]] as [number,number][]};assert.throws(()=>transferTask(t,high),/fiyat/);assert.equal(t.epoch,1);});
test('expired deadline and insufficient depth never permit a new fill',async()=>{const t=createTask(DEFAULT_INPUT,market());interruptTask(t,'disconnect');t.deadlineAt=Date.now()-1;await recover(t);assert.equal(t.phase,'blocked');assert.equal(estimateBuy({...market(),asks:[[10,1]]},50000,11).fits,false);});
test('cancellation reconciles hidden fills and leaves remaining budget unused',()=>{const t=createTask(DEFAULT_INPUT,market());interruptTask(t,'lost-response');cancelTask(t);assert.equal(t.phase,'cancelled');assert.equal(t.spentCents,22500);assert.equal(t.oldOrderOpen,false);assert.ok(integrity(t).accounted);assert.throws(()=>cancelTask(t));});
test('real LLM tool protocol executes grounded tools and rejects an ineligible selection',async()=>{
 const previous={key:process.env.DEVIR_LLM_API_KEY,base:process.env.DEVIR_LLM_BASE_URL,model:process.env.DEVIR_LLM_MODEL},realFetch=globalThis.fetch;
 process.env.DEVIR_LLM_API_KEY='test-only';process.env.DEVIR_LLM_BASE_URL='https://model.test/v1';process.env.DEVIR_LLM_MODEL='protocol-test';let calls=0;
 const actions=[['reconcile_order',{}],['read_market',{}],['request_bid',{agentId:'nova'}],['request_bid',{agentId:'pulse'}],['request_bid',{agentId:'vega'}],['select_bid',{agentId:'nova'}]];
 globalThis.fetch=async()=>{const [name,args]=actions[calls++];return Response.json({choices:[{message:{role:'assistant',tool_calls:[{id:`c${calls}`,type:'function',function:{name,arguments:JSON.stringify(args)}}]}}]});};
 try{const t=createTask({...DEFAULT_INPUT,engine:'llm'},market());interruptTask(t,'disconnect');await recover(t);assert.equal(t.phase,'ready');assert.equal(calls,6);assert.equal(t.model,'protocol-test');calls=0;const bad=createTask({...DEFAULT_INPUT,engine:'llm'},market());interruptTask(bad,'limit-breach');await assert.rejects(recover(bad),/sağlamayan/);}finally{globalThis.fetch=realFetch;for(const [name,value] of [['DEVIR_LLM_API_KEY',previous.key],['DEVIR_LLM_BASE_URL',previous.base],['DEVIR_LLM_MODEL',previous.model]]){if(value===undefined)delete process.env[name!];else process.env[name!]=value;}}
});
