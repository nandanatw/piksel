import os
import io
import uuid
import time
import json
import base64
import threading
from pathlib import Path
from typing import Optional

import torch
from PIL import Image
from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import modal

app = modal.App("piksel-image-gen")

web_app = FastAPI(title="Piksel Image Generation")

web_app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

API_KEY = os.environ.get("MODAL_API_KEY", "piksel-dev-key")

tasks: dict = {}
tasks_lock = threading.Lock()

MODEL_RESOLUTIONS = {
    "1:1": (1024, 1024),
    "4:3": (1280, 960),
    "3:4": (960, 1280),
    "16:9": (1344, 768),
    "9:16": (768, 1344),
    "3:2": (1216, 832),
    "2:3": (832, 1216),
    "21:9": (1536, 640),
    "4:5": (896, 1088),
    "5:4": (1088, 896),
    "1:4": (512, 2048),
    "4:1": (2048, 512),
    "1:8": (512, 4096),
    "8:1": (4096, 512),
}

RESOLUTION_SCALES = {
    "1k": 1.0,
    "2k": 1.5,
    "3k": 2.0,
    "4k": 2.5,
}

MODEL_COSTS = {
    "flux-dev": 6,
    "flux-schnell": 3,
}

image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install_from_requirements("requirements.txt")
    .env({"HF_HUB_ENABLE_HF_TRANSFER": "1"})
)


def verify_auth(request):
    auth = request.headers.get("Authorization", "")
    expected = f"Bearer {API_KEY}"
    if auth != expected:
        raise HTTPException(status_code=401, detail="Invalid API key")


def get_dimensions(ratio: str, resolution: str) -> tuple[int, int]:
    base_w, base_h = MODEL_RESOLUTIONS.get(ratio, (1024, 1024))
    scale = RESOLUTION_SCALES.get(resolution, 1.0)
    w = int(base_w * scale)
    h = int(base_h * scale)
    w = (w // 64) * 64
    h = (h // 64) * 64
    return max(w, 256), max(h, 256)


class GenerateRequest(BaseModel):
    model: str = "flux-schnell"
    prompt: str
    ratio: str = "1:1"
    resolution: str = "1k"
    negative_prompt: str = ""
    num_inference_steps: int = 4
    guidance_scale: float = 0.0
    seed: Optional[int] = None
    ref_image_urls: list[str] = []


class AsyncTaskResponse(BaseModel):
    task_id: str
    status: str
    estimated_credit: int


class TaskResult(BaseModel):
    task_id: str
    status: str
    image_url: Optional[str] = None
    image_urls: list[str] = []
    error: Optional[str] = None
    prompt: Optional[str] = None
    model: Optional[str] = None
    ratio: Optional[str] = None
    resolution: Optional[str] = None


@web_app.get("/health")
async def health():
    return {"status": "ok", "provider": "modal"}


@web_app.post("/generate")
async def generate(request_data: GenerateRequest, request):
    verify_auth(request)
    task_id = f"modal_{uuid.uuid4().hex[:12]}"
    with tasks_lock:
        tasks[task_id] = {
            "status": "queued",
            "created_at": time.time(),
            "model": request_data.model,
            "prompt": request_data.prompt,
            "ratio": request_data.ratio,
            "resolution": request_data.resolution,
            "estimated_credit": MODEL_COSTS.get(request_data.model, 6),
        }
    threading.Thread(target=run_generation, args=(task_id, request_data), daemon=True).start()
    return {
        "task": {
            "id": task_id,
            "estimatedCredit": tasks[task_id]["estimated_credit"],
        }
    }


@web_app.get("/task/{task_id}")
async def get_task(task_id: str, request):
    verify_auth(request)
    with tasks_lock:
        task = tasks.get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return {
        "taskId": task_id,
        "status": task["status"],
        "imageUrl": task.get("image_url"),
        "imageUrls": task.get("image_urls", []),
        "error": task.get("error"),
        "prompt": task.get("prompt"),
        "model": task.get("model"),
        "ratio": task.get("ratio"),
        "resolution": task.get("resolution"),
        "estimatedCredit": task.get("estimated_credit", 6),
    }


@web_app.post("/task/{task_id}/cancel")
async def cancel_task(task_id: str, request):
    verify_auth(request)
    with tasks_lock:
        task = tasks.get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if task["status"] in ("done", "failed", "cancelled"):
        return {"cancelled": task["status"] == "cancelled", "error": None}
    task["status"] = "cancelled"
    task["cancelled_at"] = time.time()
    return {"cancelled": True, "error": None}


@web_app.post("/upload")
async def upload_image(file: UploadFile = File(...), request):
    verify_auth(request)
    try:
        contents = await file.read()
        img = Image.open(io.BytesIO(contents))
        img = img.convert("RGB")
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        material_id = f"mat_{uuid.uuid4().hex[:12]}"
        with tasks_lock:
            tasks[material_id] = {
                "status": "uploaded",
                "image_data": base64.b64encode(buf.getvalue()).decode(),
                "created_at": time.time(),
            }
        return {"material": {"id": material_id}, "downloadUrl": f"/download/{material_id}"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@web_app.get("/account/status")
async def account_status(request):
    verify_auth(request)
    return {"credit": {"balance": 99999}, "status": "active"}


@web_app.get("/task/cost/{model}")
async def task_cost(model: str):
    return {"estimatedCredit": MODEL_COSTS.get(model, 6)}


@web_app.post("/analyze")
async def analyze_image(file: UploadFile = File(...), request):
    verify_auth(request)
    return {"prompt": "image analysis not available on modal", "tags": []}


def run_generation(task_id: str, req: GenerateRequest):
    try:
        with tasks_lock:
            tasks[task_id]["status"] = "running"
            tasks[task_id]["started_at"] = time.time()

        pipe = load_pipeline(req.model)
        w, h = get_dimensions(req.ratio, req.resolution)
        generator = torch.Generator("cpu")
        if req.seed is not None:
            generator.manual_seed(req.seed)

        result = pipe(
            prompt=req.prompt,
            negative_prompt=req.negative_prompt or None,
            width=w,
            height=h,
            num_inference_steps=req.num_inference_steps,
            guidance_scale=req.guidance_scale,
            generator=generator,
        )
        img = result.images[0]
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        img_b64 = base64.b64encode(buf.getvalue()).decode()
        image_url = f"data:image/png;base64,{img_b64}"

        with tasks_lock:
            tasks[task_id]["status"] = "done"
            tasks[task_id]["image_url"] = image_url
            tasks[task_id]["image_urls"] = [image_url]
            tasks[task_id]["finished_at"] = time.time()
    except Exception as e:
        with tasks_lock:
            tasks[task_id]["status"] = "failed"
            tasks[task_id]["error"] = str(e)[:500]
            tasks[task_id]["finished_at"] = time.time()


_pipe_cache = {}
_pipe_lock = threading.Lock()


def load_pipeline(model_name: str):
    with _pipe_lock:
        if model_name in _pipe_cache:
            return _pipe_cache[model_name]

    from diffusers import FluxPipeline

    if model_name == "flux-schnell":
        model_id = "black-forest-labs/FLUX.1-schnell"
    elif model_name == "flux-dev":
        model_id = "black-forest-labs/FLUX.1-dev"
    else:
        model_id = "black-forest-labs/FLUX.1-schnell"

    pipe = FluxPipeline.from_pretrained(
        model_id,
        torch_dtype=torch.bfloat16,
    )
    pipe.to("cuda")
    pipe.enable_model_cpu_offload()

    with _pipe_lock:
        _pipe_cache[model_name] = pipe
    return pipe


@app.function(
    image=image,
    gpu="A10G",
    container_idle_timeout=300,
    allow_concurrent_inputs=10,
)
@modal.asgi_app()
def fastapi_app():
    return web_app