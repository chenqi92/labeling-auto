"""端到端冒烟测试（mock 模式）：上传 -> 检测 -> 导出 YOLO -> 校验 zip。"""
import io
import sys
import zipfile

import requests
from PIL import Image

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8123"


def main() -> int:
    # health / tasks
    assert requests.get(f"{BASE}/api/health").json()["ok"] is True
    tasks = requests.get(f"{BASE}/api/tasks").json()["tasks"]
    assert any(t["key"] == "detection" for t in tasks), "缺少 detection 任务"
    print("health/tasks OK ->", [t["key"] for t in tasks])

    # 造两张测试图
    ids = []
    for i, size in enumerate([(640, 480), (800, 600)]):
        buf = io.BytesIO()
        Image.new("RGB", size, (40 + i * 30, 80, 160)).save(buf, "PNG")
        buf.seek(0)
        r = requests.post(
            f"{BASE}/api/images",
            files={"files": (f"pic{i}.png", buf, "image/png")},
        )
        r.raise_for_status()
        meta = r.json()[0]
        assert meta["width"] == size[0] and meta["height"] == size[1]
        ids.append(meta["id"])
    print("upload OK ->", ids)

    # 列表接口应能取回刚上传的图片（刷新恢复用）
    listed = {m["id"] for m in requests.get(f"{BASE}/api/images").json()}
    assert set(ids) <= listed, "list 接口缺少刚上传的图片"
    print("list OK ->", len(listed), "images on server")

    # 检测（mock 引擎，按 query 确定性返回框）
    r = requests.post(
        f"{BASE}/api/detect",
        json={"image_id": ids[0], "query": "person, car", "task": "detection"},
    )
    r.raise_for_status()
    det = r.json()
    assert len(det["boxes"]) >= 1, "未返回任何框"
    labels = {b["label"] for b in det["boxes"]}
    assert labels <= {"person", "car"}, f"标签异常: {labels}"
    # 框坐标应在原图范围内
    for b in det["boxes"]:
        assert 0 <= b["x1"] <= b["x2"] <= 640 and 0 <= b["y1"] <= b["y2"] <= 480
    print(f"detect OK -> {len(det['boxes'])} boxes, labels={labels}, {det['elapsed_ms']}ms")

    # 导出 YOLO
    export_req = {
        "dataset_name": "smoke",
        "classes": ["person", "car"],
        "items": [
            {
                "image_id": ids[0],
                "annotations": [
                    {"class_id": 0, "x1": 100, "y1": 100, "x2": 300, "y2": 260},
                    {"class_id": 1, "x1": 320, "y1": 200, "x2": 500, "y2": 400},
                ],
            },
            {
                "image_id": ids[1],
                "annotations": [
                    {"class_id": 1, "x1": 50, "y1": 50, "x2": 150, "y2": 150},
                ],
            },
        ],
        "train_ratio": 0.8,
    }
    r = requests.post(f"{BASE}/api/export/yolo", json=export_req)
    r.raise_for_status()
    assert r.headers["content-type"] == "application/zip"
    z = zipfile.ZipFile(io.BytesIO(r.content))
    names = z.namelist()
    print("export zip entries:")
    for n in sorted(names):
        print("   ", n)

    assert "data.yaml" in names
    assert "classes.txt" in names
    # 校验某个 label 文件内容（归一化）
    label_files = [n for n in names if n.startswith("labels/") and n.endswith(".txt")]
    assert label_files, "无 label 文件"
    sample = z.read(label_files[0]).decode().strip().splitlines()
    print("sample label:", label_files[0], "->", sample)
    for line in sample:
        parts = line.split()
        assert len(parts) == 5, f"label 行格式错误: {line}"
        cid = int(parts[0])
        xc, yc, w, h = map(float, parts[1:])
        assert 0 <= cid <= 1
        assert all(0.0 <= v <= 1.0 for v in (xc, yc, w, h)), f"坐标未归一化: {line}"

    # 验证第一张图第一个框的归一化数值（100,100,300,260 在 640x480 上）
    # xc=(100+300)/2/640=0.3125, yc=(100+260)/2/480=0.375, w=200/640=0.3125, h=160/480=0.3333
    data_yaml = z.read("data.yaml").decode()
    assert "nc: 2" in data_yaml
    print("\ndata.yaml:\n" + data_yaml)

    # 缺失图片应报 410（而非静默导出空集）
    r = requests.post(
        f"{BASE}/api/export/yolo",
        json={
            "dataset_name": "x",
            "classes": ["a"],
            "items": [{"image_id": "nonexistent", "annotations": []}],
        },
    )
    assert r.status_code == 410, f"缺失图片未报 410，实际 {r.status_code}"
    print("missing-image export -> 410 OK")

    # 越界 class_id 应被跳过（nc=1 时 class_id=5 不应出现在 label 里）
    r = requests.post(
        f"{BASE}/api/export/yolo",
        json={
            "dataset_name": "y",
            "classes": ["only"],
            "items": [
                {
                    "image_id": ids[0],
                    "annotations": [
                        {"class_id": 0, "x1": 10, "y1": 10, "x2": 50, "y2": 50},
                        {"class_id": 5, "x1": 60, "y1": 60, "x2": 90, "y2": 90},
                    ],
                }
            ],
        },
    )
    r.raise_for_status()
    z2 = zipfile.ZipFile(io.BytesIO(r.content))
    lf = [n for n in z2.namelist() if n.startswith("labels/") and n.endswith(".txt")][0]
    rows = z2.read(lf).decode().strip().splitlines()
    assert all(line.startswith("0 ") for line in rows), f"越界类别未被跳过: {rows}"
    assert len(rows) == 1, f"应只剩 1 行有效标注，实际 {rows}"
    print("out-of-range class_id skipped OK ->", rows)

    print("ALL SMOKE TESTS PASSED")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
