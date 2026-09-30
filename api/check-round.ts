import { createCheckRoundHandler, productionLimiters } from "../src/server/handlers/ai-endpoints.js";

/** POST /api/check-round — one AI request per round (contracts/http-api.md). */
export default createCheckRoundHandler({ env: process.env, limiter: productionLimiters.checkRound() });
