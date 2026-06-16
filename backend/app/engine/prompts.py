"""LocateAnything-3B 官方 prompt 模板（逐字对照模型卡）。

注意官方故意保留的语法差异：detection / 多类目用 "matches"，多短语 grounding 用 "match"。
多个类目用 "</c>" 连接，例如 "person</c>car"。
"""
from __future__ import annotations

# 多类目分隔符（模型卡：cats = "</c>".join(categories)）
CATEGORY_SEP = "</c>"


def detection_prompt(categories: list[str]) -> str:
    cats = CATEGORY_SEP.join(c.strip() for c in categories if c.strip())
    return f"Locate all the instances that matches the following description: {cats}."


def grounding_prompt(phrase: str, single: bool = False) -> str:
    phrase = phrase.strip()
    if single:
        return f"Locate a single instance that matches the following description: {phrase}."
    return f"Locate all the instances that match the following description: {phrase}."


def text_grounding_prompt(phrase: str) -> str:
    return f"Please locate the text referred as {phrase.strip()}."


def ocr_prompt() -> str:
    return "Detect all the text in box format."


def gui_prompt(phrase: str) -> str:
    return f"Locate the region that matches the following description: {phrase.strip()}."


def point_prompt(phrase: str) -> str:
    return f"Point to: {phrase.strip()}."
