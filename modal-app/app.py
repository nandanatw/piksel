import os
import io
import random
import base64
from pathlib import Path
from typing import Optional

import torch
from PIL import Image
from fastapi import FastAPI, HTTPException, UploadFile, File, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
import modal

app = modal.App("piksel-image-gen")

CACHE_DIR = "/cache"
MINUTES = 60

image = (
    modal.Image.debian_slim(python_version="3.11")
    .uv_pip_install(
        "accelerate>=1.1",
        "diffusers>=0.31",
        "fastapi[standard]>=0.115",
        "huggingface-hub>=0.36",
        "pillow>=10.4",
        "sentencepiece>=0.2",
        "torch>=2.5",
        "transformers>=4.46",
    )
    .env({
        "HF_XET_HIGH_PERFORMANCE": "1",
        "HF_HUB_CACHE": CACHE_DIR,
    })
)

with image.imports():
    import diffusers

cache_volume = modal.Volume.from_name("hf-hub-cache", create_if_missing=True)

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

MODEL_IDS = {
    "flux-schnell": "black-forest-labs/FLUX.1-schnell",
    "flux-dev": "black-forest-labs/FLUX.1-dev",
}


def get_dimensions(ratio: str, resolution: str) -> tuple[int, int]:
    base_w, base_h = MODEL_RESOLUTIONS.get(ratio, (1024, 1024))
    scale = RESOLUTION_SCALES.get(resolution, 1.0)
    w = int(base_w * scale)
    h = int(base_h * scale)
    w = (w // 64) * 64
    h = (h // 64) * 64
    return max(w, 256), max(h, 256)


@app.cls(
    image=image,
    gpu="A10G",
    timeout=10 * MINUTES,
    volumes={CACHE_DIR: cache_volume},
    secrets=[modal.Secret.from_name("piksel-modal")],
    container_idle_timeout=300,
    allow_concurrent_inputs=5,
)
class Model:
    @modal.enter()
    def load_pipeline(self):
        model_id = MODEL_IDS.get("flux-schnell")
        self.pipe_schnell = diffusers.FluxPipeline.from_pretrained(
            model_id,
            torch_dtype=torch.bfloat16,
        )
        self.pipe_schnell.to("cuda")

        model_id_dev = MODEL_IDS.get("flux-dev")
        self.pipe_dev = diffusers.FluxPipeline.from_pretrained(
            model_id_dev,
            torch_dtype=torch.bfloat16,
        )
        self.pipe_dev.to("cuda")

    def _get_pipe(self, model: str):
        if model == "flux-dev":
            return self.pipe_dev
        return self.pipe_schnell

    @modal.method()
    def generate(
        self,
        prompt: str,
        model: str = "flux-schnell",
        ratio: str = "1:1",
        resolution: str = "1k",
        negative_prompt: str = "",
        num_inference_steps: int = 4,
        guidance_scale: float = 0.0,
        seed: Optional[int] = None,
        ref_image_b64: Optional[str] = None,
    ) -> dict:
        pipe = self._get_pipe(model)
        w, h = get_dimensions(ratio, resolution)

        generator = torch.Generator("cuda")
        if seed is not None:
            generator.manual_seed(seed)
        else:
            generator.manual_seed(random.randint(0, 2**32 - 1))

        ref_image = None
        if ref_image_b64:
            try:
                img_bytes = base64.b64decode(ref_image_b64)
                ref_image = Image.open(io.BytesIO(img_bytes)).convert("RGB")
                ref_image = ref_image.resize((w, h))
            except Exception:
                pass

        kwargs = dict(
            prompt=prompt,
            width=w,
            height=h,
            num_inference_steps=num_inference_steps,
            guidance_scale=guidance_scale,
            generator=generator,
        )
        if negative_prompt:
            kwargs["negative_prompt"] = negative_prompt
        if ref_image:
            kwargs["image"] = ref_image

        result = pipe(**kwargs)
        img = result.images[0]

        buf = io.BytesIO()
        img.save(buf, format="PNG")
        img_b64 = base64.b64encode(buf.getvalue()).decode()

        torch.cuda.empty_cache()

        return {
            "imageUrl": f"data:image/png;base64,{img_b64}",
            "imageUrls": [f"data:image/png;base64,{img_b64}"],
            "model": model,
            "prompt": prompt,
            "ratio": ratio,
            "resolution": resolution,
            "estimatedCredit": MODEL_COSTS.get(model, 6),
        }

    @modal.fastapi_endpoint(method="POST")
    def generate_web(
        self,
        prompt: str,
        model: str = "flux-schnell",
        ratio: str = "1:1",
        resolution: str = "1k",
        negative_prompt: str = "",
        num_inference_steps: int = 4,
        guidance_scale: float = 0.0,
        seed: Optional[int] = None,
        ref_image_b64: Optional[str] = None,
    ):
        return self.generate.local(
            prompt=prompt,
            model=model,
            ratio=ratio,
            resolution=resolution,
            negative_prompt=negative_prompt,
            num_inference_steps=num_inference_steps,
            guidance_scale=guidance_scale,
            seed=seed,
            ref_image_b64=ref_image_b64,
        )

    @modal.fastapi_endpoint(method="POST", path="/generate")
    async def generate_json(self, request: Request):
        body = await request.json()
        return self.generate.local(
            prompt=body.get("prompt", ""),
            model=body.get("model", "flux-schnell"),
            ratio=body.get("ratio", "1:1"),
            resolution=body.get("resolution", "1k"),
            negative_prompt=body.get("negative_prompt", ""),
            num_inference_steps=body.get("num_inference_steps", 4),
            guidance_scale=body.get("guidance_scale", 0.0),
            seed=body.get("seed"),
            ref_image_b64=body.get("ref_image_b64"),
        )

    @modal.fastapi_endpoint(method="GET", path="/health")
    def health(self):
        return {"status": "ok", "provider": "modal"}

    @modal.fastapi_endpoint(method="GET", path="/account/status")
    def account_status(self):
        return {"credit": {"balance": 99999}, "status": "active"}

    @modal.fastapi_endpoint(method="GET", path="/task/cost/{model}")
    def task_cost(self, model: str):
        return {"estimatedCredit": MODEL_COSTS.get(model, 6)}

    @modal.fastapi_endpoint(method="POST", path="/upload")
    async def upload_image(self, file: UploadFile = File(...)):
        contents = await file.read()
        img_b64 = base64.b64encode(contents).decode()
        return {"material": {"id": f"mat_{img_b64[:12]}"}, "downloadUrl": "", "image_b64": img_b64}

    @modal.fastapi_endpoint(method="POST", path="/analyze")
    async def analyze_image(self, file: UploadFile = File(...)):
        return {"prompt": "", "tags": []}

    @modal.fastapi_endpoint(method="GET", path="/task/{task_id}")
    def get_task(self, task_id: str):
        return {"taskId": task_id, "status": "done", "imageUrl": "", "imageUrls": []}

    @modal.fastapi_endpoint(method="POST", path="/task/{task_id}/cancel")
    def cancel_task(self, task_id: str):
        return {"cancelled": True, "error": None}


@app.function(
    image=image,
    secrets=[modal.Secret.from_name("piksel-modal")],
)
@modal.concurrent(max_inputs=100)
@modal.asgi_app()
def fastapi_app():
    fastapi_app = FastAPI(title="Piksel Image Generation")
    fastapi_app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    auth_scheme = HTTPBearer(auto_error=False)

    def verify_auth(token: Optional[HTTPAuthorizationCredentials] = Depends(auth_scheme)):
        api_key = os.environ.get("MODAL_API_KEY", "piksel-dev-key")
        if token and token.credentials == api_key:
            return True
        raise HTTPException(status_code=401, detail="Invalid API key")

    model = Model()

    class GenerateBody(BaseModel):
        model: str = "flux-schnell"
        prompt: str = ""
        ratio: str = "1:1"
        resolution: str = "1k"
        negative_prompt: str = ""
        num_inference_steps: int = 4
        guidance_scale: float = 0.0
        seed: Optional[int] = None
        ref_image_b64: Optional[str] = None

    @fastapi_app.get("/health")
    async def health():
        return {"status": "ok", "provider": "modal"}

    @fastapi_app.post("/generate")
    async def generate(body: GenerateBody, _=Depends(verify_auth)):
        return model.generate.remote(
            prompt=body.prompt,
            model=body.model,
            ratio=body.ratio,
            resolution=body.resolution,
            negative_prompt=body.negative_prompt,
            num_inference_steps=body.num_inference_steps,
            guidance_scale=body.guidance_scale,
            seed=body.seed,
            ref_image_b64=body.ref_image_b64,
        )

    @fastapi_app.get("/account/status")
    async def account_status(_=Depends(verify_auth)):
        return {"credit": {"balance": 99999}, "status": "active"}

    @fastapi_app.get("/task/cost/{model}")
    async def task_cost(model: str):
        return {"estimatedCredit": MODEL_COSTS.get(model, 6)}

    @fastapi_app.post("/upload")
    async def upload_image(file: UploadFile = File(...), _=Depends(verify_auth)):
        contents = await file.read()
        img_b64 = base64.b64encode(contents).decode()
        return {"material": {"id": f"mat_{img_b64[:12]}"}, "downloadUrl": "", "image_b64": img_b64}

    @fastapi_app.post("/analyze")
    async def analyze_image(file: UploadFile = File(...), _=Depends(verify_auth)):
        return {"prompt": "", "tags": []}

    @fastapi_app.get("/task/{task_id}")
    async def get_task(task_id: str, _=Depends(verify_auth)):
        return {"taskId": task_id, "status": "done", "imageUrl": "", "imageUrls": []}

    @fastapi_app.post("/task/{task_id}/cancel")
    async def cancel_task(task_id: str, _=Depends(verify_auth)):
        return {"cancelled": True, "error": None}

    return fastapi_app