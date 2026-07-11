/**
 * Input validation middleware for job submission (POST /v1/jobs).
 * Validates required fields, model existence, quantization, and input type.
 */

import { Request, Response, NextFunction } from "express";
import {
  ErrorCode,
  createErrorResponse,
  ERROR_HTTP_STATUS,
} from "@neuralgrid/shared";
import { QUANTIZATION_VALUES } from "@neuralgrid/shared";
import type { Quantization } from "@neuralgrid/shared";

/**
 * Model entry shape needed for validation.
 * Mirrors compute-estimator registry's ModelEntry.
 */
export interface ModelEntry {
  family: string;
  params_billions?: number;
  default_quantization: Quantization;
  vram_gb: Partial<Record<Quantization, number>>;
  tier: string;
  input_types: string[];
  output_types: string[];
  notes?: string;
}

export type ModelLookup = (id: string) => ModelEntry | undefined;

/**
 * Factory: creates validation middleware with injectable model lookup.
 * This allows unit testing without loading YAML from disk.
 */
export function createValidationMiddleware(getModel: ModelLookup) {
  return function validateJobSubmission(
    req: Request,
    res: Response,
    next: NextFunction
  ): void {
    const body = req.body;

    // 1. Check required fields
    const requiredFields = ["model", "input", "output"];
    const missingFields = requiredFields.filter(
      (f) => body[f] === undefined || body[f] === null
    );

    if (missingFields.length > 0) {
      const errResp = createErrorResponse(
        ErrorCode.INVALID_REQUEST,
        `Missing required fields: ${missingFields.join(", ")}`,
        { missing_fields: missingFields }
      );
      res.status(ERROR_HTTP_STATUS[ErrorCode.INVALID_REQUEST]).json(errResp);
      return;
    }

    // 2. Validate model exists in registry
    const model = getModel(body.model);
    if (!model) {
      const errResp = createErrorResponse(
        ErrorCode.MODEL_NOT_SUPPORTED,
        `Model '${body.model}' is not supported`,
        { model: body.model }
      );
      res.status(ERROR_HTTP_STATUS[ErrorCode.MODEL_NOT_SUPPORTED]).json(errResp);
      return;
    }

    // 3. Validate quantization (if provided)
    if (body.quantization !== undefined) {
      const supportedQuantizations = Object.keys(model.vram_gb) as Quantization[];
      if (!supportedQuantizations.includes(body.quantization)) {
        const errResp = createErrorResponse(
          ErrorCode.INVALID_REQUEST,
          `Quantization '${body.quantization}' is not supported for model '${body.model}'`,
          { supported_quantizations: supportedQuantizations }
        );
        res.status(ERROR_HTTP_STATUS[ErrorCode.INVALID_REQUEST]).json(errResp);
        return;
      }
    }

    // 4. Validate input type
    if (body.input && body.input.type) {
      if (!model.input_types.includes(body.input.type)) {
        const errResp = createErrorResponse(
          ErrorCode.INVALID_REQUEST,
          `Input type '${body.input.type}' is not supported for model '${body.model}'`,
          { supported_input_types: model.input_types }
        );
        res.status(ERROR_HTTP_STATUS[ErrorCode.INVALID_REQUEST]).json(errResp);
        return;
      }
    }

    next();
  };
}
