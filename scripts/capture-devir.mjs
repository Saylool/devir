import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import fs from 'node:fs/promises';
const run=promisify(execFile);
async function capture(args){const {stdout}=await run(process.execPath,['node_modules/@okx_ai/okx-trade-cli/dist/index.js','market',...args,'--json'],{env:{...process.env,OKX_SITE:'tr'},timeout:20000,maxBuffer:1024*1024});return JSON.parse(stdout);}
const [ticker,books]=await Promise.all([capture(['ticker','AVAX-USDT']),capture(['orderbook','AVAX-USDT','--sz','20'])]);
const first=x=>(Array.isArray(x)?x:x.data)[0];
if(!first(ticker)?.last||!first(books)?.asks?.length)throw new Error('Invalid ATK capture');
await fs.writeFile('data/devir-atk.json',JSON.stringify({capturedAt:new Date().toISOString(),site:'tr',cliVersion:'1.4.8',ticker:first(ticker),book:first(books)},null,2)+'\n');
console.log('Public ATK ticker and order book captured; no account data or trades.');
