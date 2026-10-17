# OKX Agent Trade Kit — restricted server integration

Source: https://github.com/okx/agent-trade-kit
Pinned commit: `1278636c3c16d31be99c888e5051622f8cc87f8e` (MIT, © 2026 OKX).

`tools/market.ts`, `tools/helpers.ts`, `tools/common.ts`, `utils/errors.ts`, and `utils/rate-limiter.ts` are copied byte-for-byte from `packages/core/src` at that commit. Their upstream license is included. The local `config.ts` and `tools/types.ts` are reduced type boundaries for the Fetch transport, not upstream runtime code.

DEVİR invokes the actual `registerMarketTools()` handlers (`market_get_ticker`, `market_get_orderbook`) for every live market read. A deliberately restricted Fetch transport replaces the Node-only RestClient/Pilot transport. It allows only the corresponding public OKX TR GET endpoints, retains the toolkit's rate limiter, and never accesses account credentials. This is ATK core with a custom transport, not the CLI or a live order-execution connection. Paper order reconciliation is separately labelled and never represented as a private OKX API result.
