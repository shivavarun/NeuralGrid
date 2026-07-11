"use strict";
/**
 * Unit tests for Job_Scheduler Express server and worker pool.
 * Requirements: 8.6, 8.2, 8.3
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const supertest_1 = __importDefault(require("supertest"));
const index_1 = __importStar(require("./index"));
(0, vitest_1.describe)("Job_Scheduler server", () => {
    (0, vitest_1.beforeEach)(() => {
        index_1.jobStore.clear();
    });
    (0, vitest_1.describe)("GET /health", () => {
        (0, vitest_1.it)("returns ok with pool info", async () => {
            const res = await (0, supertest_1.default)(index_1.default).get("/health");
            (0, vitest_1.expect)(res.status).toBe(200);
            (0, vitest_1.expect)(res.body.status).toBe("ok");
            (0, vitest_1.expect)(res.body.service).toBe("job-scheduler");
            (0, vitest_1.expect)(res.body.pool_size).toBe(10);
            (0, vitest_1.expect)(res.body).toHaveProperty("active_workers");
            (0, vitest_1.expect)(res.body).toHaveProperty("queue_length");
        });
    });
    (0, vitest_1.describe)("POST /internal/dispatch", () => {
        (0, vitest_1.it)("returns 202 with job_id and queued status", async () => {
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
            const res = await (0, supertest_1.default)(index_1.default)
                .post("/internal/dispatch")
                .send(dispatchReq);
            (0, vitest_1.expect)(res.status).toBe(202);
            (0, vitest_1.expect)(res.body.job_id).toBe("job_test123");
            (0, vitest_1.expect)(res.body.status).toBe("queued");
        });
        (0, vitest_1.it)("returns 400 when missing required fields", async () => {
            const res = await (0, supertest_1.default)(index_1.default).post("/internal/dispatch").send({});
            (0, vitest_1.expect)(res.status).toBe(400);
            (0, vitest_1.expect)(res.body.error.code).toBe("INVALID_REQUEST");
        });
    });
    (0, vitest_1.describe)("GET /internal/job/:id", () => {
        (0, vitest_1.it)("returns 404 for unknown job", async () => {
            const res = await (0, supertest_1.default)(index_1.default).get("/internal/job/nonexistent");
            (0, vitest_1.expect)(res.status).toBe(404);
            (0, vitest_1.expect)(res.body.error.code).toBe("JOB_NOT_FOUND");
        });
        (0, vitest_1.it)("returns job status when job exists", async () => {
            index_1.jobStore.set("job_abc", {
                job_id: "job_abc",
                status: "running",
                provider: "runpod",
                retries: 0,
            });
            const res = await (0, supertest_1.default)(index_1.default).get("/internal/job/job_abc");
            (0, vitest_1.expect)(res.status).toBe(200);
            (0, vitest_1.expect)(res.body.job_id).toBe("job_abc");
            (0, vitest_1.expect)(res.body.status).toBe("running");
            (0, vitest_1.expect)(res.body.provider).toBe("runpod");
        });
    });
});
//# sourceMappingURL=index.test.js.map