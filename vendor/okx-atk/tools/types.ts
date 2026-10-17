import type { RateLimitConfig } from '../utils/rate-limiter';
export interface ToolContext {
  config: { demo: boolean };
  client: { publicGet(path: string, query?: Record<string, unknown>, rateLimit?: RateLimitConfig, simulatedTrading?: boolean): Promise<{endpoint:string;requestTime:string;data:unknown}> };
}
export interface ToolSpec {
  name:string; title:string; module:string; description:string; isWrite:boolean;
  inputSchema:Record<string,unknown>;
  handler(args:Record<string,unknown>,context:ToolContext):Promise<unknown>;
}
