import { createHealthHandler } from "../src/server/handlers/health.js";

/** GET /api/health (contracts/http-api.md). */
export default createHealthHandler({ env: process.env });
