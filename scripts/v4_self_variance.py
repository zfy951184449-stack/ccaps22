"""v4_self_variance.py — 对照实验：同一请求连打两次 V4，量化超时档自身方差。

用途：A 轮回归在超时 FEASIBLE 档出现 V4/V5 分叉时，先测 V4 自己跑两次的
方差作为噪声基线。若 V4 自身方差与 V4/V5 分叉同量级，则分叉属墙钟非确定
性噪声，而非 V5 系统性漂移。

用法：python3 scripts/v4_self_variance.py 1236 1238 1239
Python 3.9 兼容，仅依赖标准库 + requests。
"""
import json
import sys
import copy

import requests

V4_SOLVE = "http://localhost:5005/api/v4/solve"
LOGS_DIR = "solver_v4/logs"


def load_request(rid):
    path = "%s/request_%s.json" % (LOGS_DIR, rid)
    with open(path) as f:
        req = json.load(f)
    # 阻断回调（避免打到不存在的 backend）
    cfg = req.setdefault("config", {})
    meta = cfg.get("metadata")
    if isinstance(meta, dict):
        meta.pop("run_id", None)
    return req


def solve_once(req, tag):
    body = copy.deepcopy(req)
    body["request_id"] = "selfvar-%s" % tag
    resp = requests.post(V4_SOLVE, json=body, timeout=900)
    resp.raise_for_status()
    r = resp.json()
    m = r.get("metrics") or {}
    return {
        "status": r.get("status"),
        "objective": m.get("objective_value"),
        "vacant": m.get("vacant_positions"),
        "shortage": m.get("special_shift_shortage_total"),
    }


def main():
    rids = sys.argv[1:] or ["1236", "1238", "1239"]
    print("%-8s %-6s %-22s %-22s %s" % ("case", "run", "objective", "vacant", "status"))
    for rid in rids:
        req = load_request(rid)
        runs = []
        for i in (1, 2):
            out = solve_once(req, "%s-r%d" % (rid, i))
            runs.append(out)
            print("%-8s r%-5d %-22s %-22s %s" % (rid, i, out["objective"], out["vacant"], out["status"]))
        a, b = runs
        if a["objective"] is not None and b["objective"] is not None:
            diff = abs(a["objective"] - b["objective"])
            base = max(abs(a["objective"]), 1)
            print("%-8s delta  obj=%.0f (%.2f%%)  vacant: %s vs %s" % (
                rid, diff, 100.0 * diff / base, a["vacant"], b["vacant"]))
        print("-" * 70)


if __name__ == "__main__":
    main()
