import base64
import io
import os
import random
from typing import Optional

import modal

app = modal.App("piksel-image-gen")

CACHE_DIR = "/cache"
MINUTES = 60

image = (
    modal.Image.debian_slim(python_version="3.11")
    .uv_pip_install(
        "accelerate==1.10.1",
        "diffusers==0.35.1",
        "fastapi[standard]==0.116.1",
        "huggingface-hub[hf-transfer]==0.35.0",
        "pillow==11.3.0",
        "sentencepiece==0.2.0",
        "torch==2.8.0",
        "transformers==4.56.1",
    )
    .env(
        {
            "HF_HUB_ENABLE_HF_TRANSFER": "1",
            "HF_HUB_CACHE": CACHE_DIR,
        }
    )
)

with image.imports():
    import diffusers
    import torch
    from PIL import Image

cache_volume = modal.Volume.from_name("hf-hub-cache", create_if_missing=True)
secret = modal.Secret.from_name("piksel-modal")

MODEL_IDS = {
    "flux-schnell": "black-forest-labs/FLUX.1-schnell",
    "flux-dev": "black-forest-labs/FLUX.1-dev",
}

MODEL_COSTS = {"flux-dev": 6, "flux-schnell": 3}

DEFAULT_STEPS = {"flux-schnell": 4, "flux-dev": 28}
DEFAULT_GUIDANCE = {"flux-schnell": 0.0, "flux-dev": 3.5}

RATIOS = {
    "1:1": (1024, 1024),
    "4:3": (1152, 864),
    "3:4": (864, 1152),
    "16:9": (1344, 768),
    "9:16": (768, 1344),
    "3:2": (1216, 832),
    "2:3": (832, 1216),
    "21:9": (1536, 640),
    "4:5": (896, 1088),
    "5:4": (1088, 896),
}

RESOLUTION_SCALES = {"1k": 1.0, "2k": 1.5, "3k": 2.0, "4k": 2.5}


def get_dimensions(ratio: str, resolution: str) -> tuple[int, int]:
    base_w, base_h = RATIOS.get(ratio, (1024, 1024))
    scale = RESOLUTION_SCALES.get(resolution, 1.0)
    w = max(256, int(base_w * scale) // 16 * 16)
    h = max(256, int(base_h * scale) // 16 * 16)
    return w, h


@app.cls(
    image=image,
    # L4 (24GB) is the cheapest card that fits Flux with CPU offload.
    # A10 is the fallback when L4 capacity is unavailable.
    gpu=os.environ.get("PIKSEL_GPU", "L4,A10").split(","),
    timeout=10 * MINUTES,
    volumes={CACHE_DIR: cache_volume},
    secrets=[secret],
    scaledown_window=300,
)
class Model:
    """One container pool per model, so only one set of weights is resident.

    Concurrency is 1: CPU offload moves modules between host and device
    mid-inference, which is not safe to share across simultaneous calls.
    """

    model_name: str = modal.parameter(default="flux-schnell")

    @modal.enter()
    def load(self):
        model_id = MODEL_IDS.get(self.model_name, MODEL_IDS["flux-schnell"])
        self.txt2img = diffusers.FluxPipeline.from_pretrained(
            model_id, torch_dtype=torch.bfloat16
        )
        # Flux in bf16 is larger than a 24GB card, so keep weights in host RAM
        # and stream each submodule to the GPU as it runs. Do not call .to("cuda")
        # alongside this; offload manages device placement itself.
        self.txt2img.enable_model_cpu_offload()
        # Reuse the loaded components for img2img instead of a second download.
        self.img2img = diffusers.FluxImg2ImgPipeline(**self.txt2img.components)

    @modal.method()
    def generate(
        self,
        prompt: str,
        ratio: str = "1:1",
        resolution: str = "1k",
        num_inference_steps: Optional[int] = None,
        guidance_scale: Optional[float] = None,
        seed: Optional[int] = None,
        ref_image_b64: Optional[str] = None,
        strength: float = 0.75,
    ) -> dict:
        width, height = get_dimensions(ratio, resolution)
        steps = num_inference_steps or DEFAULT_STEPS.get(self.model_name, 4)
        guidance = (
            guidance_scale
            if guidance_scale is not None
            else DEFAULT_GUIDANCE.get(self.model_name, 0.0)
        )
        used_seed = seed if seed is not None else random.randint(0, 2**32 - 1)
        generator = torch.Generator("cuda").manual_seed(used_seed)

        if ref_image_b64:
            init = Image.open(io.BytesIO(base64.b64decode(ref_image_b64)))
            init = init.convert("RGB").resize((width, height))
            images = self.img2img(
                prompt=prompt,
                image=init,
                strength=strength,
                width=width,
                height=height,
                num_inference_steps=steps,
                guidance_scale=guidance,
                generator=generator,
            ).images
        else:
            images = self.txt2img(
                prompt=prompt,
                width=width,
                height=height,
                num_inference_steps=steps,
                guidance_scale=guidance,
                generator=generator,
            ).images

        buf = io.BytesIO()
        images[0].save(buf, format="PNG")
        data_url = "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()
        torch.cuda.empty_cache()

        return {
            "imageUrl": data_url,
            "imageUrls": [data_url],
            "model": self.model_name,
            "prompt": prompt,
            "ratio": ratio,
            "resolution": resolution,
            "seed": used_seed,
            "estimatedCredit": MODEL_COSTS.get(self.model_name, 6),
        }


@app.function(image=image, secrets=[secret], timeout=10 * MINUTES)
@modal.concurrent(max_inputs=100)
@modal.asgi_app()
def fastapi_app():
    from fastapi import Depends, FastAPI, File, HTTPException, UploadFile
    from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
    from pydantic import BaseModel as PydanticModel

    web_app = FastAPI(title="Piksel Image Generation")
    auth_scheme = HTTPBearer(auto_error=False)

    def verify(token: Optional[HTTPAuthorizationCredentials] = Depends(auth_scheme)):
        expected = os.environ.get("MODAL_API_KEY")
        if not expected or not token or token.credentials != expected:
            raise HTTPException(status_code=401, detail="Invalid API key")
        return True

    class GenerateBody(PydanticModel):
        prompt: str
        model: str = "flux-schnell"
        ratio: str = "1:1"
        resolution: str = "1k"
        num_inference_steps: Optional[int] = None
        guidance_scale: Optional[float] = None
        seed: Optional[int] = None
        ref_image_b64: Optional[str] = None

    @web_app.get("/health")
    async def health():
        return {"status": "ok", "provider": "modal"}

    @web_app.get("/account/status")
    async def account_status(_=Depends(verify)):
        return {"credit": {"balance": 99999}, "status": "active"}

    @web_app.get("/task/cost/{model}")
    async def task_cost(model: str):
        return {"estimatedCredit": MODEL_COSTS.get(model, 6)}

    @web_app.post("/generate")
    async def generate(body: GenerateBody, _=Depends(verify)):
        if body.model not in MODEL_IDS:
            raise HTTPException(status_code=400, detail=f"Unknown model {body.model}")
        try:
            return Model(model_name=body.model).generate.remote(
                prompt=body.prompt,
                ratio=body.ratio,
                resolution=body.resolution,
                num_inference_steps=body.num_inference_steps,
                guidance_scale=body.guidance_scale,
                seed=body.seed,
                ref_image_b64=body.ref_image_b64,
            )
        except Exception as exc:
            raise HTTPException(status_code=500, detail=str(exc)[:500])

    @web_app.post("/upload")
    async def upload(file: UploadFile = File(...), _=Depends(verify)):
        contents = await file.read()
        return {"image_b64": base64.b64encode(contents).decode()}

    @web_app.post("/analyze")
    async def analyze(file: UploadFile = File(...), _=Depends(verify)):
        raise HTTPException(status_code=501, detail="Image analysis not implemented")

    return web_app
