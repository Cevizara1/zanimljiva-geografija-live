import { createHealthHandler } from "../src/server/handlers/health";

/** GET /api/health (contracts/http-api.md). */
export default createHealthHandler({ env: process.env });
