import { Router } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";

const router = Router();

/**
 * Main health endpoint (USE THIS)
 */
router.get("/health", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json({
    ...data,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

/**
 * Backward compatibility (prevents broken links)
 */
router.get("/healthz", (_req, res) => {
  res.redirect("/health");
});

export default router;