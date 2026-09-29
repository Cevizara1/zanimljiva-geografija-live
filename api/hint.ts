import { createHintHandler, productionLimiters } from "../src/server/handlers/ai-endpoints";

/** POST /api/hint — one AI request per spent credit (contracts/http-api.md). */
export default createHintHandler({ env: process.env, limiter: productionLimiters.hint() });
