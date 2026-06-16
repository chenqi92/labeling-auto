"""nvidia/LocateAnything-3B 真实推理引擎。

调用方式逐字对照官方模型卡的 worker 实现：
- processor.py_apply_chat_template(...)  （注意 py_ 前缀，是自定义方法）
- processor.process_vision_info(messages)（processor 上的方法，非 qwen_vl_utils）
- model.generate(pixel_values=, input_ids=, attention_mask=, image_grid_hws=, tokenizer=,
                 generation_mode=, repetition_penalty=1.1, ...)
- 输出按 <box><x1><y1><x2><y2></box> 解析，坐标 [0,1000] 归一化整数。
"""
from __future__ import annotations

import threading

from PIL import Image

from app.config import settings
from app.engine.base import DetectParams, LocateEngine
from app.engine.parsing import parse_boxes, parse_points

# torch / transformers 在加载时才 import，避免无依赖时整个后端起不来
_DTYPE_MAP: dict = {}


def _resolve_dtype(name: str):
    import torch

    if not _DTYPE_MAP:
        _DTYPE_MAP.update(
            {"bfloat16": torch.bfloat16, "float16": torch.float16, "float32": torch.float32}
        )
    return _DTYPE_MAP.get(name, torch.bfloat16)


# 量化时保持高精度、不量化的模块名候选（名字不匹配会被忽略，安全）。
# LocateAnything = Qwen2.5-3B LM + MoonViT 视觉塔 + MLP projector。
_SKIP_QUANT_MODULES = [
    "lm_head",
    "visual",
    "vision_tower",
    "vision_model",
    "merger",
    "mlp_projector",
    "mlp1",
]


class LocateAnythingEngine(LocateEngine):
    name = "locate-anything-3b"

    def __init__(self) -> None:
        import torch
        from transformers import AutoModel, AutoProcessor, AutoTokenizer

        self._torch = torch
        self._device = settings.device
        self._dtype = _resolve_dtype(settings.torch_dtype)
        self._gen_lock = threading.Lock()
        self._quant_desc = "none"

        model_id = settings.model_id
        self.tokenizer = AutoTokenizer.from_pretrained(model_id, trust_remote_code=True)
        self.processor = AutoProcessor.from_pretrained(model_id, trust_remote_code=True)

        load_kwargs: dict = {"trust_remote_code": True, "torch_dtype": self._dtype}

        quant_cfg = self._build_quant_config()
        if quant_cfg is not None:
            load_kwargs["quantization_config"] = quant_cfg
            load_kwargs["device_map"] = "auto"

        self.model = self._load_model(AutoModel, model_id, load_kwargs)
        if quant_cfg is None and self._device != "auto":
            self.model = self.model.to(self._device)
        self.model.eval()

    # —— 加载辅助 ——
    def _build_quant_config(self):
        from transformers import BitsAndBytesConfig

        if settings.load_in_4bit:
            self._quant_desc = "4bit-nf4"
            return BitsAndBytesConfig(
                load_in_4bit=True,
                bnb_4bit_quant_type="nf4",
                bnb_4bit_compute_dtype=self._dtype,
                bnb_4bit_use_double_quant=True,
                llm_int8_skip_modules=_SKIP_QUANT_MODULES,
            )
        if settings.load_in_8bit:
            self._quant_desc = "8bit"
            return BitsAndBytesConfig(
                load_in_8bit=True, llm_int8_skip_modules=_SKIP_QUANT_MODULES
            )
        return None

    def _load_model(self, AutoModel, model_id: str, load_kwargs: dict):
        """先按配置的 attn_implementation 加载，失败则降级到 eager，再失败则不传该参数。"""
        attn = settings.attn_implementation
        for attempt in ([attn, "eager", None] if attn != "eager" else ["eager", None]):
            kwargs = dict(load_kwargs)
            if attempt is not None:
                kwargs["attn_implementation"] = attempt
            try:
                return AutoModel.from_pretrained(model_id, **kwargs)
            except (ValueError, TypeError, KeyError, ImportError, RuntimeError, OSError) as e:
                # flash_attention_2 缺包时 transformers 抛 ImportError，需一并捕获以降级到 eager
                last = e
                continue
        raise last  # type: ignore[name-defined]

    # —— 信息 ——
    def info(self) -> dict:
        try:
            dev = str(next(self.model.parameters()).device)
        except Exception:
            dev = self._device
        return {
            "engine": self.name,
            "device": dev,
            "dtype": settings.torch_dtype,
            "quantization": self._quant_desc,
        }

    # —— 预处理 ——
    def _maybe_downscale(self, image: Image.Image) -> Image.Image:
        side = settings.max_image_side
        if side and max(image.width, image.height) > side:
            scale = side / max(image.width, image.height)
            new = (max(1, round(image.width * scale)), max(1, round(image.height * scale)))
            return image.resize(new, Image.LANCZOS)
        return image

    def _build_inputs(self, image: Image.Image, question: str):
        image = self._maybe_downscale(image.convert("RGB"))
        messages = [
            {
                "role": "user",
                "content": [
                    {"type": "image", "image": image},
                    {"type": "text", "text": question},
                ],
            }
        ]
        text = self.processor.py_apply_chat_template(
            messages, tokenize=False, add_generation_prompt=True
        )
        images, videos = self.processor.process_vision_info(messages)
        inputs = self.processor(
            text=[text], images=images, videos=videos, return_tensors="pt"
        ).to(self._device)
        return inputs

    def _generate(self, inputs, params: DetectParams) -> str:
        torch = self._torch
        pixel_values = inputs["pixel_values"].to(self._dtype)
        with self._gen_lock, torch.inference_mode():
            response = self.model.generate(
                pixel_values=pixel_values,
                input_ids=inputs["input_ids"],
                attention_mask=inputs["attention_mask"],
                image_grid_hws=inputs.get("image_grid_hws", None),
                tokenizer=self.tokenizer,
                max_new_tokens=params.max_new_tokens,
                use_cache=True,
                generation_mode=params.mode,
                temperature=params.temperature,
                do_sample=params.do_sample,
                top_p=params.top_p,
                repetition_penalty=1.1,
                verbose=False,
            )
        return _extract_answer(response)

    # —— 推理 ——
    def run(self, image: Image.Image, question: str, params: DetectParams):
        inputs = self._build_inputs(image, question)
        answer = self._generate(inputs, params)
        return parse_boxes(answer), answer

    def run_points(self, image: Image.Image, question: str, params: DetectParams):
        inputs = self._build_inputs(image, question)
        answer = self._generate(inputs, params)
        return parse_points(answer), answer


def _extract_answer(response) -> str:
    """官方 generate 可能返回 str，或 (answer, history, stats) 元组。"""
    if isinstance(response, tuple):
        answer = response[0] if response else ""
    elif isinstance(response, list):
        answer = response[0] if response else ""
    else:
        answer = response
    return answer if isinstance(answer, str) else str(answer)
