"""运行配置。所有项均可用 LA_ 前缀的环境变量覆盖，例如 LA_MOCK=1。"""
from __future__ import annotations

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="LA_",
        env_file=".env",
        extra="ignore",
        protected_namespaces=(),  # 允许使用 model_ 前缀字段名
    )

    # —— 模型 ——
    model_id: str = "nvidia/LocateAnything-3B"
    device: str = "cuda"                 # cuda | cpu
    torch_dtype: str = "bfloat16"        # bfloat16 | float16 | float32
    load_in_4bit: bool = True            # 6GB 显存默认 4-bit
    load_in_8bit: bool = False
    attn_implementation: str = "sdpa"    # sdpa | eager | flash_attention_2（加载失败会自动降级到 eager）
    generation_mode: str = "slow"        # slow | hybrid | fast（slow 最稳，避免自定义 CUDA kernel）
    # 推理前把长边缩到该像素以内以省显存（框坐标是归一化的，不损标注精度）；0 表示不缩放
    max_image_side: int = 1280

    # —— 生成默认值 ——
    max_new_tokens: int = 1024
    temperature: float = 0.7
    top_p: float = 0.9
    do_sample: bool = True

    # —— 视觉问答（状态判断/巡检）：经本机 Ollama 调 Qwen2.5-VL，与检测分离 ——
    ollama_url: str = "http://127.0.0.1:11434"
    vqa_model: str = "qwen2.5vl:7b"
    vqa_keep_alive: str = "5m"        # 空闲多久后 Ollama 卸载模型释放显存
    vqa_timeout: float = 180.0        # 首次调用需加载模型，留足超时
    vqa_max_image_side: int = 1024    # 送入 VQA 前缩图长边
    vqa_max_new_tokens: int = 512

    # —— 开发用假引擎（无需 GPU）——
    mock: bool = False

    # —— 服务 ——
    data_dir: str = "./.data"
    cors_origins: list[str] = Field(
        default_factory=lambda: [
            "http://localhost:5173",
            "http://127.0.0.1:5173",
            "http://localhost:4173",
        ]
    )
    # 是否在启动时立刻加载模型（默认 False = 懒加载）
    eager_load: bool = False


settings = Settings()
