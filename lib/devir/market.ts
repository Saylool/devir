import { registerMarketTools } from '../../vendor/okx-atk/tools/market';
import { RateLimiter, type RateLimitConfig } from '../../vendor/okx-atk/utils/rate-limiter';
import recorded from '../../data/devir-atk.json';
import type { Market } from './types';

const toolkit=registerMarketTools();
const limiter=new RateLimiter(1500);
const paths=new Set(['/api/v5/market/ticker','/api/v5/market/books']);
const context={config:{demo:false},client:{async publicGet(path:string,query:Record<string,unknown>={},rate?:RateLimitConfig,demo=false){
 if(!paths.has(path)||demo||query.instId!=='AVAX-USDT')throw new Error('Bu ATK bağlantısı yalnız AVAX-USDT public verisine açıktır.');
 if(rate)await limiter.consume(rate);
 const url=new URL(path,'https://tr.okx.com');for(const [k,v] of Object.entries(query))if(v!==undefined)url.searchParams.set(k,String(v));
 const response=await fetch(url,{signal:AbortSignal.timeout(7000),headers:{Accept:'application/json'},cache:'no-store'});
 if(!response.ok)throw new Error(`OKX HTTP ${response.status}`);
 const raw=await response.json() as {code:string;data:unknown;msg?:string};
 if(raw.code!=='0'||!Array.isArray(raw.data)||!raw.data.length)throw new Error('OKX verisi alınamadı.');
 return {endpoint:`GET ${path}`,requestTime:new Date().toISOString(),data:raw.data};
}}};
export async function callMarketTool(name:'market_get_ticker'|'market_get_orderbook'){
 const tool=toolkit.find(t=>t.name===name)!;
 return await tool.handler({instId:'AVAX-USDT',...(name==='market_get_orderbook'?{sz:20}:{}),demo:false},context) as {endpoint:string;requestTime:string;data:Record<string,unknown>[]};
}
function normalize(ticker:Record<string,unknown>,book:Record<string,unknown>,source:Market['source']):Market{
 const levels=(x:unknown):[number,number][]=>{if(!Array.isArray(x))throw new Error('Emir defteri geçersiz.');return x.map(v=>[Number(v[0]),Number(v[1])] as [number,number]).filter(v=>v[0]>0&&v[1]>0&&v.every(Number.isFinite));};
 const asks=levels(book.asks),bids=levels(book.bids),price=Number(ticker.last),sourceTime=Math.min(Number(ticker.ts),Number(book.ts));
 if(!asks.length||!bids.length||!(price>0)||!Number.isFinite(sourceTime))throw new Error('ATK yanıtı doğrulanamadı.');
 const age=Date.now()-sourceTime,stale=source!=='atk-core'||age>60000||age< -5000;
 return {instrument:'AVAX-USDT',price,bid:bids[0][0],ask:asks[0][0],asks,bids,sourceTime,receivedAt:Date.now(),source,stale,tools:['market_get_ticker','market_get_orderbook']};
}
export async function readDevirMarket():Promise<Market>{
 try {const [t,b]=await Promise.all([callMarketTool('market_get_ticker'),callMarketTool('market_get_orderbook')]);const market=normalize(t.data[0],b.data[0],'atk-core');if(market.stale)throw new Error('Piyasa verisi 60 saniyeden eski.');return market;}
 catch {return {...normalize(recorded.ticker,recorded.book,'atk-recording'),error:'Canlı ATK verisi alınamadı. Tarihli kayıtla simülasyon sürüyor.'};}
}
