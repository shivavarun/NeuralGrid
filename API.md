# NeuralGrid API Reference

Base URL: `https://api.neuralgrid.dev/v1`
Auth: `Authorization: Bearer ng_<your_api_key>`

---

## Submit a job

**POST /v1/jobs**

```bash
curl -X POST https://api.neuralgrid.dev/v1/jobs \
  -H "Authorization: Bearer ng_your_key_here" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "llama-3-8b",
    "input": {
      "type": "text",
      "content": "Explain quantum entanglement in simple terms.",
      "token_count": 10
    },
    "output": {
      "type": "text",
      "max_tokens": 512
    },
    "quantization": "int8"
  }'
```

Response `202 Accepted`:
```json
{
  "id": "job_01j9x2kp4m3n5q6r7s8t",
  "status": "queued",
  "tier": "T1",
  "estimated_cost_usd": "0.0018",
  "poll_url": "https://api.neuralgrid.dev/v1/jobs/job_01j9x2kp4m3n5q6r7s8t",
  "created_at": "2026-06-17T10:00:00Z"
}
```

---

## Get job status

**GET /v1/jobs/:id**

```bash
curl https://api.neuralgrid.dev/v1/jobs/job_01j9x2kp4m3n5q6r7s8t \
  -H "Authorization: Bearer ng_your_key_here"
```

Response (running):
```json
{
  "id": "job_01j9x2kp4m3n5q6r7s8t",
  "status": "running",
  "tier": "T1",
  "provider": "vastai",
  "estimated_cost_usd": "0.0018",
  "created_at": "2026-06-17T10:00:00Z"
}
```

Response (complete):
```json
{
  "id": "job_01j9x2kp4m3n5q6r7s8t",
  "status": "complete",
  "tier": "T1",
  "provider": "vastai",
  "estimated_cost_usd": "0.0018",
  "actual_cost_usd": "0.0021",
  "result_url": "https://api.neuralgrid.dev/v1/jobs/job_01j9x2kp4m3n5q6r7s8t/result",
  "created_at": "2026-06-17T10:00:00Z",
  "completed_at": "2026-06-17T10:00:14Z"
}
```

---

## Get job result

**GET /v1/jobs/:id/result**

```bash
curl https://api.neuralgrid.dev/v1/jobs/job_01j9x2kp4m3n5q6r7s8t/result \
  -H "Authorization: Bearer ng_your_key_here"
```

Response (text job):
```json
{
  "type": "text",
  "content": "Quantum entanglement is a phenomenon where two particles...",
  "tokens_generated": 487,
  "model": "llama-3-8b",
  "finish_reason": "stop"
}
```

Response (image job):
```json
{
  "type": "image",
  "images": [
    {
      "url": "https://results.neuralgrid.dev/img/abc123.png",
      "expires_at": "2026-06-18T10:00:00Z",
      "width": 1024,
      "height": 1024
    }
  ]
}
```

---

## Estimate cost before submitting

**GET /v1/models/:model_id/estimate**

```bash
curl "https://api.neuralgrid.dev/v1/models/llama-3-8b/estimate?input_tokens=2048&max_tokens=512&quantization=int8" \
  -H "Authorization: Bearer ng_your_key_here"
```

Response:
```json
{
  "model": "llama-3-8b",
  "tier": "T1",
  "min_vram_gb": 8.5,
  "estimated_runtime_seconds": 12,
  "estimated_cost_usd": "0.0021",
  "confidence": "HIGH",
  "vs_runpod_a100": {
    "runpod_cost_usd": "0.0133",
    "saving_pct": 84
  }
}
```

---

## List supported models

**GET /v1/models**

```json
{
  "models": [
    {
      "id": "llama-3-8b",
      "family": "llama",
      "default_tier": "T1",
      "supported_quantizations": ["fp16", "int8", "int4"],
      "input_types": ["text"],
      "output_types": ["text"]
    },
    {
      "id": "stable-diffusion-xl",
      "family": "diffusion",
      "default_tier": "T2",
      "supported_quantizations": ["fp16"],
      "input_types": ["text"],
      "output_types": ["image"]
    }
  ],
  "total": 34
}
```

---

## Error codes

| Code | HTTP | Meaning |
|------|------|---------|
| UNAUTHORIZED | 401 | Invalid or missing API key |
| RATE_LIMIT_EXCEEDED | 429 | Too many requests |
| PAYMENT_FAILED | 402 | Could not charge payment method |
| BUDGET_EXCEEDED | 400 | Job estimated cost exceeds your max_cost_usd cap |
| MODEL_NOT_SUPPORTED | 400 | Model not in supported list |
| INSUFFICIENT_CAPACITY | 503 | No nodes available at required tier right now |
| JOB_NOT_FOUND | 404 | Job ID doesn't exist or belongs to another user |
| JOB_NOT_COMPLETE | 409 | Result requested but job not finished |

---

## Python SDK (quick start)

```python
# pip install neuralgrid
import neuralgrid

client = neuralgrid.Client(api_key="ng_your_key_here")

# LLM inference
result = client.jobs.run(
    model="llama-3-8b",
    input={"type": "text", "content": "What is the capital of France?"},
    output={"type": "text", "max_tokens": 100},
    quantization="int8"
)
print(result.content)  # "The capital of France is Paris."
print(f"Cost: ${result.actual_cost_usd}")  # Cost: $0.0008

# Image generation
result = client.jobs.run(
    model="stable-diffusion-xl",
    input={"type": "text", "content": "A mountain at sunset, photorealistic"},
    output={"type": "image", "image_count": 1}
)
print(result.images[0].url)
```
