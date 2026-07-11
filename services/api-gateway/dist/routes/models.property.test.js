"use strict";
/**
 * Property 14: Model Registry Listing Completeness
 * Verify response contains every model from registry and total equals models returned count.
 *
 * **Validates: Requirements 5.1, 5.2**
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
const express_1 = __importDefault(require("express"));
const supertest_1 = __importDefault(require("supertest"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const yaml = __importStar(require("js-yaml"));
const fc = __importStar(require("fast-check"));
const models_1 = require("./models");
const REGISTRY_PATH = path.resolve(__dirname, '../../../../model_registry.yaml');
(0, vitest_1.describe)('Feature: neuralgrid-mvp, Property 14: Model Registry Listing Completeness', () => {
    let app;
    let registry;
    let modelIds;
    (0, vitest_1.beforeEach)(() => {
        (0, models_1.resetModelRegistry)();
        app = (0, express_1.default)();
        app.use(express_1.default.json());
        app.use((0, models_1.createModelsRouter)({ registryPath: REGISTRY_PATH }));
        const raw = fs.readFileSync(REGISTRY_PATH, 'utf-8');
        registry = yaml.load(raw);
        modelIds = Object.keys(registry.models);
    });
    (0, vitest_1.afterEach)(() => {
        (0, models_1.resetModelRegistry)();
    });
    (0, vitest_1.it)('total field equals number of models returned in array', async () => {
        await fc.assert(fc.asyncProperty(fc.constant(null), async () => {
            const res = await (0, supertest_1.default)(app).get('/v1/models');
            (0, vitest_1.expect)(res.status).toBe(200);
            const body = res.body;
            (0, vitest_1.expect)(body.total).toBe(body.models.length);
        }), { numRuns: 100 });
    });
    (0, vitest_1.it)('total equals number of models in YAML registry', async () => {
        await fc.assert(fc.asyncProperty(fc.constant(null), async () => {
            const res = await (0, supertest_1.default)(app).get('/v1/models');
            (0, vitest_1.expect)(res.status).toBe(200);
            const body = res.body;
            (0, vitest_1.expect)(body.total).toBe(modelIds.length);
        }), { numRuns: 100 });
    });
    (0, vitest_1.it)('every randomly sampled model ID from registry appears in response with correct fields', async () => {
        // Generate random non-empty subsets of model IDs
        const subsetArb = fc
            .subarray(modelIds, { minLength: 1, maxLength: modelIds.length })
            .filter((arr) => arr.length > 0);
        await fc.assert(fc.asyncProperty(subsetArb, async (sampledIds) => {
            const res = await (0, supertest_1.default)(app).get('/v1/models');
            (0, vitest_1.expect)(res.status).toBe(200);
            const body = res.body;
            const responseIds = body.models.map((m) => m.id);
            for (const id of sampledIds) {
                // Model must be present in response
                (0, vitest_1.expect)(responseIds).toContain(id);
                const model = body.models.find((m) => m.id === id);
                const entry = registry.models[id];
                // Required fields exist and are correct types
                (0, vitest_1.expect)(typeof model.id).toBe('string');
                (0, vitest_1.expect)(typeof model.family).toBe('string');
                (0, vitest_1.expect)(['T1', 'T2', 'T3']).toContain(model.default_tier);
                (0, vitest_1.expect)(Array.isArray(model.supported_quantizations)).toBe(true);
                (0, vitest_1.expect)(Array.isArray(model.input_types)).toBe(true);
                (0, vitest_1.expect)(Array.isArray(model.output_types)).toBe(true);
                // Values match registry
                (0, vitest_1.expect)(model.family).toBe(entry.family);
                (0, vitest_1.expect)(model.default_tier).toBe(entry.tier);
                (0, vitest_1.expect)(model.supported_quantizations).toEqual(Object.keys(entry.vram_gb));
                (0, vitest_1.expect)(model.input_types).toEqual(entry.input_types);
                (0, vitest_1.expect)(model.output_types).toEqual(entry.output_types);
            }
        }), { numRuns: 100 });
    });
    (0, vitest_1.it)('no extra models in response beyond what registry contains', async () => {
        await fc.assert(fc.asyncProperty(fc.constant(null), async () => {
            const res = await (0, supertest_1.default)(app).get('/v1/models');
            (0, vitest_1.expect)(res.status).toBe(200);
            const body = res.body;
            const responseIds = body.models.map((m) => m.id);
            // Every response ID must be in registry
            for (const id of responseIds) {
                (0, vitest_1.expect)(modelIds).toContain(id);
            }
            // No duplicates
            const uniqueIds = new Set(responseIds);
            (0, vitest_1.expect)(uniqueIds.size).toBe(responseIds.length);
        }), { numRuns: 100 });
    });
});
//# sourceMappingURL=models.property.test.js.map