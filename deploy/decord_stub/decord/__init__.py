"""decord 占位模块（stub）。

本部署只做图片自动标注，从不读取视频；而模型的 processing_locateanything.py 在模块顶层
无条件 `import decord`。decord 在新版 Python 上没有可用 wheel，故用此占位满足 import，
其视频相关 API 一旦被调用即报错（实际不会被调用）。
"""
__version__ = "0.0.0-stub"


class _Unsupported:
    def __init__(self, *args, **kwargs):
        raise NotImplementedError(
            "decord 是占位实现：本部署不支持视频，仅支持图片自动标注。"
        )


class VideoReader(_Unsupported):
    pass


class VideoLoader(_Unsupported):
    pass


def cpu(*args, **kwargs):
    return None


def gpu(*args, **kwargs):
    return None


class bridge:  # noqa: N801  保持与 decord.bridge 同名
    @staticmethod
    def set_bridge(*args, **kwargs):
        return None
