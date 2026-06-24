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

    # —— 视觉问答（状态判断/巡检 + 文字识别）：经本机 Ollama 调视觉语言模型(VLM)，与检测分离 ——
    ollama_url: str = "http://127.0.0.1:11434"
    vqa_model: str = "qwen3.5:9b-q8_0"   # 需为 Ollama 中带 vision 能力的模型
    vqa_keep_alive: str = "5m"        # 空闲多久后 Ollama 卸载模型释放显存
    vqa_timeout: float = 180.0        # 首次调用需加载模型，留足超时
    vqa_max_image_side: int = 1024    # 送入 VQA 前缩图长边
    vqa_max_new_tokens: int = 512
    # qwen3 等推理模型默认会「思考」(长 CoT)，OCR/巡检不需要，关掉可大幅提速。设 True 恢复思考。
    vqa_think: bool = False
    # 16GB 卡上检测(LocateAnything)与 VQA 模型放不下同时常驻：开启后二者互斥，
    # 用前先卸载对方释放显存（谁用谁加载，切换时有一次重载耗时）。大显存可设为 0 关闭。
    vqa_exclusive: bool = True

    # —— YOLOE-26（Ultralytics）开放词汇检测：LocateAnything 之外的可选检测引擎 ——
    yoloe_weights_dir: str = "/data/ultralytics/weights"
    yoloe_config_dir: str = "/data/ultralytics"
    yoloe_conf: float = 0.25          # 检测置信度阈值
    # 一键去背用的 rembg session（BiRefNet 边缘优于 u2net）；可设 birefnet-general-lite / u2net
    rembg_session: str = "birefnet-general"

    # —— 开发用假引擎（无需 GPU）——
    mock: bool = False

    # —— 账户 / 持久化（SQLite，纯标准库）——
    # DB 路径默认放在 data_dir 下；首次启动自动建表并播种管理员账号。
    db_path: str = ""                       # 空 = {data_dir}/app.db
    auth_token_ttl_days: int = 14           # 会话令牌有效期
    default_admin_user: str = "admin"       # 首次启动播种的管理员账号
    default_admin_password: str = "admin123"  # 首次登录后请在「用户管理」改密
    default_admin_name: str = "管理员"

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
