"use strict";
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
const models_1 = require("./models");
const REGISTRY_PATH = path.resolve(__dirname, '../../../../model_registry.yaml');
(0, vitest_1.describe)('GET /v1/models', () => {
    let app;
    (0, vitest_1.beforeEach)(() => {
        (0, models_1.resetModelRegistry)();
        app = (0, express_1.default)();
        app.use(express_1.default.json());
        app.use((0, models_1.createModelsRouter)({ registryPath: REGISTRY_PATH }));
    });
    (0, vitest_1.afterEach)(() => {
        (0, models_1.resetModelRegistry)();
    });
    (0, vitest_1.it)('returns 200 with models array and total count', async () => {
        const res = await (0, supertest_1.default)(app).get('/v1/models');
        (0, vitest_1.expect)(res.status).toBe(200);
        (0, vitest_1.expect)(res.body).toHaveProperty('models');
        (0, vitest_1.expect)(res.body).toHaveProperty('total');
        (0, vitest_1.expect)(Array.isArray(res.body.models)).toBe(true);
        (0, vitest_1.expect)(res.body.total).toBe(res.body.models.length);
    });
    (0, vitest_1.it)('total matches number of models in registry YAML', async () => {
        const raw = fs.readFileSync(REGISTRY_PATH, 'utf-8');
        const parsed = yaml.load(raw);
        const expectedCount = Object.keys(parsed.models).length;
        const res = await (0, supertest_1.default)(app).get('/v1/models');
        (0, vitest_1.expect)(res.body.total).toBe(expectedCount);
    });
    (0, vitest_1.it)('each model has required fields: id, family, default_tier, supported_quantizations, input_types, output_types', async () => {
        const res = await (0, supertest_1.default)(app).get('/v1/models');
        for (const model of res.body.models) {
            (0, vitest_1.expect)(model).toHaveProperty('id');
            (0, vitest_1.expect)(model).toHaveProperty('family');
            (0, vitest_1.expect)(model).toHaveProperty('default_tier');
            (0, vitest_1.expect)(model).toHaveProperty('supported_quantizations');
            (0, vitest_1.expect)(model).toHaveProperty('input_types');
            (0, vitest_1.expect)(model).toHaveProperty('output_types');
            (0, vitest_1.expect)(typeof model.id).toBe('string');
            (0, vitest_1.expect)(typeof model.family).toBe('string');
            (0, vitest_1.expect)(['T1', 'T2', 'T3']).toContain(model.default_tier);
            (0, vitest_1.expect)(Array.isArray(model.supported_quantizations)).toBe(true);
            (0, vitest_1.expect)(Array.isArray(model.input_types)).toBe(true);
            (0, vitest_1.expect)(Array.isArray(model.output_types)).toBe(true);
        }
    });
    (0, vitest_1.it)('supported_quantizations are derived from vram_gb keys', async () => {
        const raw = fs.readFileSync(REGISTRY_PATH, 'utf-8');
        const parsed = yaml.load(raw);
        const res = await (0, supertest_1.default)(app).get('/v1/models');
        for (const model of res.body.models) {
            const entry = parsed.models[model.id];
            const expectedQuants = Object.keys(entry.vram_gb);
            (0, vitest_1.expect)(model.supported_quantizations).toEqual(expectedQuants);
        }
    });
    (0, vitest_1.it)('includes known model llama-3-8b with correct data', async () => {
        const res = await (0, supertest_1.default)(app).get('/v1/models');
        const llama = res.body.models.find((m) => m.id === 'llama-3-8b');
        (0, vitest_1.expect)(llama).toBeDefined();
        (0, vitest_1.expect)(llama.family).toBe('llama');
        (0, vitest_1.expect)(llama.default_tier).toBe('T1');
        (0, vitest_1.expect)(llama.supported_quantizations).toEqual(['fp32', 'fp16', 'int8', 'int4']);
        (0, vitest_1.expect)(llama.input_types).toEqual(['text']);
        (0, vitest_1.expect)(llama.output_types).toEqual(['text']);
    });
    (0, vitest_1.it)('includes image model stable-diffusion-xl with correct types', async () => {
        const res = await (0, supertest_1.default)(app).get('/v1/models');
        const sdxl = res.body.models.find((m) => m.id === 'stable-diffusion-xl');
        (0, vitest_1.expect)(sdxl).toBeDefined();
        (0, vitest_1.expect)(sdxl.family).toBe('diffusion');
        (0, vitest_1.expect)(sdxl.default_tier).toBe('T2');
        (0, vitest_1.expect)(sdxl.input_types).toEqual(['text', 'image']);
        (0, vitest_1.expect)(sdxl.output_types).toEqual(['image']);
    });
    (0, vitest_1.it)('returns 500 when registry file is missing', async () => {
        (0, models_1.resetModelRegistry)();
        const badApp = (0, express_1.default)();
        badApp.use((0, models_1.createModelsRouter)({ registryPath: '/nonexistent/path.yaml' }));
        const res = await (0, supertest_1.default)(badApp).get('/v1/models');
        (0, vitest_1.expect)(res.status).toBe(500);
        (0, vitest_1.expect)(res.body.error.code).toBe('INTERNAL_ERROR');
    });
});
//# sourceMappingURL=models.test.js.map