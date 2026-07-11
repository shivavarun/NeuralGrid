"use strict";
/**
 * Models listing endpoint — GET /v1/models
 * Returns all models from the registry with metadata.
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadModelRegistry = loadModelRegistry;
exports.resetModelRegistry = resetModelRegistry;
exports.createModelsRouter = createModelsRouter;
const express_1 = require("express");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const yaml = __importStar(require("js-yaml"));
// --- Registry loader ---
let cachedRegistry = null;
function loadModelRegistry(filePath) {
    if (cachedRegistry)
        return cachedRegistry;
    const resolvedPath = filePath || path.resolve(__dirname, '../../../../model_registry.yaml');
    const raw = fs.readFileSync(resolvedPath, 'utf-8');
    const parsed = yaml.load(raw);
    if (!parsed || !parsed.models) {
        throw new Error("Invalid model registry: missing 'models' key");
    }
    cachedRegistry = parsed;
    return cachedRegistry;
}
function resetModelRegistry() {
    cachedRegistry = null;
}
function createModelsRouter(deps = {}) {
    const router = (0, express_1.Router)();
    router.get('/v1/models', (_req, res) => {
        try {
            const registry = loadModelRegistry(deps.registryPath);
            const models = Object.entries(registry.models).map(([id, entry]) => ({
                id,
                family: entry.family,
                default_tier: entry.tier,
                supported_quantizations: Object.keys(entry.vram_gb),
                input_types: entry.input_types,
                output_types: entry.output_types,
            }));
            const response = {
                models,
                total: models.length,
            };
            res.status(200).json(response);
        }
        catch (err) {
            res.status(500).json({
                error: {
                    code: 'INTERNAL_ERROR',
                    message: 'Failed to load model registry',
                },
            });
        }
    });
    return router;
}
//# sourceMappingURL=models.js.map