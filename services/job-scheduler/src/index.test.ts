/**
 * Unit tests for Job_Scheduler Express server and worker pool.
 * Requirements: 8.6, 8.2, 8.3
 */

import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app, { jobStore } from "./index";

describe("Job_Scheduler server", () => {
  beforeEach(() => {
    jobStore.clear();
  });

  describe("GET /health", () => {
    it("returns ok with pool info", async () => {
      const res = await request(app).get("/health");
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("ok");
      expect(res.body.service).toBe("job-scheduler");
      expect(res.body.pool_size).toBe(10);
      expect(res.body).toHaveProperty("active_workers");
      expect(res.body).toHaveProperty("queue_length");
    });
  });

  describe("POST /internal/dispatch", () => {
    it("returns 202 with job_id and queued status", async () => {
      const dispatchReq = {
        job_id: "job_test123",
        model: "llama-3-8b",
        tier: "T1",
        input: { type: "text", content: "hello" },
        output: { type: "text", max_tokens: 100 },
        quantization: "int8",
        selected_node: {
          provider: "vastai",
          node_id: "node-1",
          gpu_model: "RTX 4090",
          vram_gb: 24,
          hourly_rate_usd: 0.5,
          availability: true,
        },
      };

      const res = await request(app)
        .post("/internal/dispatch")
        .send(dispatchReq);

      expect(res.status).toBe(202);
      expect(res.body.job_id).toBe("job_test123");
      expect(res.body.status).toBe("queued");
    });

    it("returns 400 when missing required fields", async () => {
      const res = await request(app).post("/internal/dispatch").send({});
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("INVALID_REQUEST");
    });
  });

  describe("GET /internal/job/:id", () => {
    it("returns 404 for unknown job", async () => {
      const res = await request(app).get("/internal/job/nonexistent");
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe("JOB_NOT_FOUND");
    });

    it("returns job status when job exists", async () => {
      jobStore.set("job_abc", {
        job_id: "job_abc",
        status: "running",
        provider: "runpod",
        retries: 0,
      });

      const res = await request(app).get("/internal/job/job_abc");
      expect(res.status).toBe(200);
      expect(res.body.job_id).toBe("job_abc");
      expect(res.body.status).toBe("running");
      expect(res.body.provider).toBe("runpod");
    });
  });
});
