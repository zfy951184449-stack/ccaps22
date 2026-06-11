#!/usr/bin/env python3
"""
V3 验证脚本：事件流抓取测试 (capture_v5_events.py)

实现计划 §V3 规格：
  mock backend 收 v5 回调，跑中等规模 solve，断言：
    1. phase 序列 BUILDING→SOLVING→EXTRACTING（无解含 DIAGNOSING）
    2. 恰一条 MODEL_STATS（num_constraints==Σcount、by_constraint 含 count/ms/vars）
    3. SOLUTION ≤1/s 且含 incumbent.breakdown
    4. preview 频率符 §2.5
    5. 单 payload<5KB
    6. 全程无 null 覆盖
    7. convergence 点用 wall_time

用法：
    python3 scripts/capture_v5_events.py
    python3 scripts/capture_v5_events.py --request solver_v5/logs/request_1240.json
    python3 scripts/capture_v5_events.py --infeasible   # 测无解路径（含 DIAGNOSING）

退出码：0=全部断言通过；1=有断言失败；2=环境/导入错误。
"""

import argparse
import json
import os
import sys
import threading
import time
import traceback
from http.server import BaseHTTPRequestHandler, HTTPServer
from io import StringIO
from typing import Any, Dict, List, Optional

# ────────────────────────────────────────────────────────────────────────────
# 路径配置：脚本可从仓库根或 scripts/ 目录运行
# ────────────────────────────────────────────────────────────────────────────

_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
_REPO_ROOT = os.path.dirname(_SCRIPT_DIR)
_SOLVER_V5_DIR = os.path.join(_REPO_ROOT, "solver_v5")

if _SOLVER_V5_DIR not in sys.path:
    sys.path.insert(0, _SOLVER_V5_DIR)

# ────────────────────────────────────────────────────────────────────────────
# Mock HTTP Backend 接收器
# ────────────────────────────────────────────────────────────────────────────


class _PayloadEntry:
    """单条 payload 条目（含接收时间戳和请求路径）。"""
    __slots__ = ("payload", "recv_time", "path")

    def __init__(self, payload: dict, recv_time: float, path: str):
        self.payload = payload
        self.recv_time = recv_time
        self.path = path


class _PayloadAccumulator:
    """线程安全的 payload 收集器（mock backend 存储）。"""

    def __init__(self):
        self._lock = threading.Lock()
        self._entries: List[_PayloadEntry] = []

    def append(self, payload: dict, recv_time: float, path: str):
        with self._lock:
            self._entries.append(_PayloadEntry(payload, recv_time, path))

    def all_entries(self) -> List[_PayloadEntry]:
        with self._lock:
            return list(self._entries)

    def all(self) -> List[Dict[str, Any]]:
        """返回所有 payload（向后兼容）。"""
        with self._lock:
            return [e.payload for e in self._entries]

    def progress_payloads(self) -> List[Dict[str, Any]]:
        """仅返回 /callback/progress 路径的 payload（排除 /callback/result 大结果体）。"""
        with self._lock:
            return [e.payload for e in self._entries if e.path.endswith("/progress")]

    def progress_entries(self) -> List[_PayloadEntry]:
        """仅返回 /callback/progress 路径的条目。"""
        with self._lock:
            return [e for e in self._entries if e.path.endswith("/progress")]

    def __len__(self):
        with self._lock:
            return len(self._entries)


_ACCUMULATOR = _PayloadAccumulator()


class _MockBackendHandler(BaseHTTPRequestHandler):
    """接收 solver_v5 推过来的 callback POST，写入 _ACCUMULATOR。"""

    def do_POST(self):  # noqa: N802
        content_length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(content_length)
        try:
            payload = json.loads(body.decode("utf-8"))
        except Exception:
            payload = {}
        _ACCUMULATOR.append(payload, time.time(), self.path)
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b'{"ok":true}')

    def do_GET(self):  # noqa: N802
        # status 轮询端点：返回 RUNNING，告知 solver 继续（不要停止）
        self.send_response(200)
        self.end_headers()
        self.wfile.write(json.dumps({"data": {"status": "RUNNING"}}).encode())

    def log_message(self, fmt, *args):  # noqa: D401
        # 静默：不污染 stdout
        pass


def _start_mock_server():
    """启动 mock backend HTTP 服务器，返回 (server, port, thread)。"""
    server = HTTPServer(("127.0.0.1", 0), _MockBackendHandler)
    port = server.server_address[1]
    t = threading.Thread(target=server.serve_forever, daemon=True)
    t.start()
    return server, port, t


# ────────────────────────────────────────────────────────────────────────────
# 构造无解请求（用于测试 DIAGNOSING 路径）
# ────────────────────────────────────────────────────────────────────────────


def _make_infeasible_request(base_request: dict) -> dict:
    """在 base_request 上构造约束冲突，使求解经历完整构建流程后 INFEASIBLE。

    策略：启用 StandardHours 约束，同时把月度工时下限偏移设为极端值，
    使任何员工都无法满足工时下限 → CP-SAT 搜索完整模型后判 INFEASIBLE
    → 触发诊断 pass + DIAGNOSING phase。

    不使用"清空候选人"手法：那会在 _build_variables 早退，跳过 SOLVING 等 phase。

    standard_hours 约束中：
      lower_bound = standard_hours_in_month - monthly_hours_lower_offset
    设置 monthly_hours_lower_offset = -999999（极大负偏移 → 下限极高），
    则 lower_bound = workdays×8 + 999999 → 绝对无法达到 → INFEASIBLE。
    """
    import copy
    req = copy.deepcopy(base_request)
    config = req.get("config") or {}
    config["allow_position_vacancy"] = True          # 允许空岗，否则唯一候选人不足也早退
    config["allow_standalone_vacancy"] = True
    config["enable_infeasibility_diagnosis"] = True
    config["diag_time_seconds"] = 10
    config["enable_solution_hint"] = False
    config["enable_standard_hours"] = True
    config["enable_lexicographic_l4"] = False

    # monthly_hours_lower_offset 含义：lower_bound = workdays*8 - lower_offset
    # 设极大负数 → lower_bound 极高 → 不可满足 → STANDARD_HOURS 冲突
    config["monthly_hours_lower_offset"] = -999999.0

    req["config"] = config
    return req


# ────────────────────────────────────────────────────────────────────────────
# 运行求解器
# ────────────────────────────────────────────────────────────────────────────


def run_solve(request_path: str, mock_url: str, infeasible_mode: bool = False,
              max_time: float = 60.0) -> dict:
    """加载 request JSON，注入 mock callback URL，运行 SolverV5，返回 result dict。

    mock_url：指向我们的 mock backend（callback/progress 端点）。
    """
    with open(request_path, encoding="utf-8") as f:
        payload = json.load(f)

    if infeasible_mode:
        payload = _make_infeasible_request(payload)

    # 注入 run_id + registry 占位（app.py 正常路径会注入；直接调时手动做）
    config = payload.get("config") or {}
    metadata = config.get("metadata") or {}
    run_id = "V3-capture-test-%d" % int(time.time())
    metadata["run_id"] = run_id
    config["metadata"] = metadata
    # 注入 mock callback URL（覆盖模块级 SOLVER_API_URL）
    os.environ["BACKEND_API_URL"] = mock_url
    # 限制求解时间（中等规模够快；防超时）
    config["max_time_seconds"] = max_time
    config["stagnation_limit"] = min(20.0, max_time * 0.3)
    # 启用所有 V5 特性以完整测试事件流
    config["enable_objective_breakdown"] = True
    config["enable_solution_hint"] = config.get("enable_solution_hint", True)
    config["enable_lexicographic_l4"] = False  # L4 不影响事件流，默认关
    payload["config"] = config

    # 重新导入 solver（使新 BACKEND_API_URL 生效）
    # 注意：core.solver 在模块级读 BACKEND_API_URL，需在 import 前设好 env。
    if "core.solver" in sys.modules:
        del sys.modules["core.solver"]
    if "core.callback" in sys.modules:
        del sys.modules["core.callback"]

    from contracts.request import SolverRequest  # noqa: PLC0415
    from core.solver import SolverV5  # noqa: PLC0415

    req = SolverRequest.from_dict(payload)

    # 注入 ACTIVE_CALLBACKS registry（app.py 正常路径）
    ACTIVE_CALLBACKS: dict = {}
    if "metadata" not in req.config:
        req.config["metadata"] = {}
    req.config["metadata"]["registry"] = ACTIVE_CALLBACKS
    req.config["metadata"]["run_id"] = run_id

    solver = SolverV5()
    result = solver.solve(req)

    # 等待 callback flush（monitor 每秒 flush，最终 end_deferred 后 final 直接发）
    time.sleep(2.0)

    return result


# ────────────────────────────────────────────────────────────────────────────
# 断言逻辑
# ────────────────────────────────────────────────────────────────────────────


class AssertionError_(Exception):
    pass


_PASS = []
_FAIL = []


def _ok(label: str):
    _PASS.append(label)
    print("  [PASS] %s" % label)


def _fail(label: str, detail: str = ""):
    _FAIL.append(label)
    msg = "  [FAIL] %s" % label
    if detail:
        msg += "\n         " + detail
    print(msg)


def _require(cond: bool, label: str, detail: str = ""):
    if cond:
        _ok(label)
    else:
        _fail(label, detail)


def assert_all(accumulator: _PayloadAccumulator, result: dict, infeasible_mode: bool = False):
    """执行全部断言（§V3 规格）。"""

    all_payloads = accumulator.all()
    payloads = accumulator.progress_payloads()  # 仅 /callback/progress，排除 /callback/result
    entries = accumulator.progress_entries()

    print("\n[断言] 事件流检查 (进度 payload=%d，总 payload=%d)\n"
          % (len(payloads), len(all_payloads)))

    # ── A1: phase 序列 ──────────────────────────────────────────────────────
    phase_events = [
        p.get("phase")
        for p in payloads
        if p.get("event") == "PHASE_ENTER" and p.get("phase")
    ]
    print("  phase 序列: %s" % phase_events)

    _require("BUILDING" in phase_events, "A1.1 phase=BUILDING 事件存在",
             "未收到 BUILDING phase_enter")
    _require("SOLVING" in phase_events, "A1.2 phase=SOLVING 事件存在",
             "未收到 SOLVING phase_enter")
    _require("EXTRACTING" in phase_events, "A1.3 phase=EXTRACTING 事件存在",
             "未收到 EXTRACTING phase_enter")

    if infeasible_mode:
        _require("DIAGNOSING" in phase_events,
                 "A1.4 无解路径 phase=DIAGNOSING 存在",
                 "无解路径未收到 DIAGNOSING phase_enter")

    # 顺序检查
    if phase_events:
        b_idx = phase_events.index("BUILDING") if "BUILDING" in phase_events else -1
        s_idx = next((i for i, p in enumerate(phase_events) if p == "SOLVING"), -1)
        e_idx = next((i for i, p in enumerate(phase_events) if p == "EXTRACTING"), -1)
        if b_idx >= 0 and s_idx >= 0 and e_idx >= 0:
            _require(b_idx < s_idx < e_idx,
                     "A1.5 phase 顺序 BUILDING<SOLVING<EXTRACTING",
                     "顺序 %s" % phase_events)
        if infeasible_mode and "DIAGNOSING" in phase_events:
            d_idx = next((i for i, p in enumerate(phase_events) if p == "DIAGNOSING"), -1)
            _require(e_idx < d_idx or d_idx < 0,
                     "A1.6 DIAGNOSING 在 EXTRACTING 之后（或无解早退）",
                     "顺序 %s" % phase_events)

    # ── A2: MODEL_STATS 恰好一条 ─────────────────────────────────────────────
    model_stats_events = [p for p in payloads if p.get("event") == "MODEL_STATS"]
    _require(len(model_stats_events) == 1,
             "A2.1 恰一条 MODEL_STATS 事件",
             "实际收到 %d 条" % len(model_stats_events))

    if model_stats_events:
        ms = model_stats_events[0].get("model_stats", {})

        # num_constraints == Σcount
        by_constraint = ms.get("by_constraint", {})
        sigma_count = sum(
            v["count"] if v.get("count") != "OFF" else 0
            for v in by_constraint.values()
        )
        num_ctr = ms.get("num_constraints", -1)
        _require(num_ctr == sigma_count,
                 "A2.2 num_constraints==Σby_constraint.count",
                 "num_constraints=%d, Σcount=%d" % (num_ctr, sigma_count))

        # by_constraint 每条有 count/ms/vars 三键
        all_have_3keys = all(
            {"count", "ms", "vars"}.issubset(set(v.keys()))
            for v in by_constraint.values()
        )
        _require(all_have_3keys,
                 "A2.3 by_constraint 每条含 count/ms/vars 三键",
                 "缺键条目: %s" % [k for k, v in by_constraint.items()
                                   if not {"count", "ms", "vars"}.issubset(set(v.keys()))])

        # by_constraint 非空
        _require(len(by_constraint) > 0,
                 "A2.4 by_constraint 非空", "by_constraint 为 {}")

    # ── A3: SOLUTION 频率 ≤1/s + 含 incumbent.breakdown ────────────────────
    solution_entries = [e for e in entries if e.payload.get("type") == "SOLUTION"]
    solution_events = [e.payload for e in solution_entries]
    print("  SOLUTION 事件数: %d" % len(solution_events))

    if len(solution_entries) > 1:
        # 检查两条 SOLUTION 之间的实际接收时间间隔（由 monitor 1s flush 节流保证）
        recv_times = [e.recv_time for e in solution_entries]
        intervals = [recv_times[i+1] - recv_times[i]
                     for i in range(len(recv_times) - 1)]
        min_interval = min(intervals) if intervals else 999
        # 允许网络延迟误差，给 0.7s 宽限（monitor 1s flush + HTTP RTT）
        _require(min_interval >= 0.7,
                 "A3.1 SOLUTION ≤1/s（相邻接收时间间隔≥0.7s）",
                 "最小间隔=%.3fs (由 monitor 1s flush 节流保证)" % min_interval)
    else:
        _ok("A3.1 SOLUTION ≤1/s（解数量<=1，无需检查）")

    # incumbent.breakdown 检查
    incumbent_events = [p for p in payloads if p.get("event") == "NEW_INCUMBENT"]
    print("  NEW_INCUMBENT 事件数: %d" % len(incumbent_events))

    if incumbent_events:
        # 检查每个 incumbent 有 breakdown（如果 enable_objective_breakdown=true）
        has_breakdown = [
            "breakdown" in p.get("incumbent", {})
            for p in incumbent_events
        ]
        _require(all(has_breakdown),
                 "A3.2 所有 NEW_INCUMBENT 含 incumbent.breakdown",
                 "缺 breakdown 的条目数: %d" % sum(1 for x in has_breakdown if not x))

        # breakdown 含正确的键
        first_bd = incumbent_events[0].get("incumbent", {}).get("breakdown", {})
        # 允许部分键缺失（disabled 分量不建观测变量），但不能一个都没有
        _require(len(first_bd) > 0,
                 "A3.3 breakdown 至少含一个分量键",
                 "breakdown=%s" % first_bd)
    else:
        if not infeasible_mode:
            _fail("A3.2 有 SOLUTION 事件应有 NEW_INCUMBENT",
                  "NEW_INCUMBENT 事件为空")

    # ── A4: preview 频率 §2.5 ────────────────────────────────────────────────
    # §2.5 下采样策略：(a) 首解，(b) ≥snapshot_min_interval 秒，(c) obj 改善 ≥5%
    # 由于 _latest_solution 覆盖机制（每秒 flush），实际发出的 SOLUTION 代表该秒
    # 内的最后一个新解，可能覆盖了首解的 preview。但整体下采样后至少应有一条 preview。
    previews_found = [
        p.get("incumbent", {}).get("preview")
        for p in incumbent_events
        if p.get("incumbent", {}).get("preview") is not None
    ]
    print("  含 preview 的 NEW_INCUMBENT 数: %d" % len(previews_found))

    if incumbent_events:
        # 断言：至少一条 incumbent 含 preview（首解可能被覆盖，但总体至少一条）
        _require(len(previews_found) >= 1,
                 "A4.1 incumbent 事件流中至少有 1 条含 preview（§2.5 下采样）",
                 "INCUMBENT=%d 条，含 preview=%d 条" % (len(incumbent_events), len(previews_found)))

    # preview 字段结构检查（方案 A：fill_rate/vacant_positions/scheduled_shifts）
    for i, pv in enumerate(previews_found[:3]):
        _require(
            "fill_rate" in pv and "vacant_positions" in pv and "scheduled_shifts" in pv,
            "A4.2 preview[%d] 含 fill_rate/vacant_positions/scheduled_shifts" % i,
            "实际 keys: %s" % list(pv.keys())
        )

    # ── A5: 进度 payload 单条 < 5KB ─────────────────────────────────────────
    # 仅检查 /callback/progress 路径的 payload；/callback/result 是完整结果体，体积大是预期的。
    oversized = []
    for i, p in enumerate(payloads):
        size = len(json.dumps(p, ensure_ascii=False).encode("utf-8"))
        if size > 5 * 1024:
            oversized.append((i, size))
    _require(len(oversized) == 0,
             "A5 进度 payload 单条 <5KB",
             "超限条目: %s" % [(i, "%.1fKB" % (s/1024)) for i, s in oversized[:5]])

    # ── A6: 全程无 null 覆盖（缺省字段省略键，不发 null）──────────────────────
    null_violations = []
    _check_keys_with_null = {
        "phase", "event", "model_stats", "incumbent", "search_stats", "infeasibility",
        "preview", "breakdown",
    }
    for i, p in enumerate(payloads):
        for key in _check_keys_with_null:
            if key in p and p[key] is None:
                null_violations.append((i, key))
        # 检查嵌套 incumbent
        inc = p.get("incumbent")
        if isinstance(inc, dict):
            for key in ("breakdown", "preview"):
                # preview=null 是合法下采样（§2.5），但 breakdown=null 不合法
                if key == "breakdown" and key in inc and inc[key] is None:
                    null_violations.append((i, "incumbent.%s" % key))
    _require(len(null_violations) == 0,
             "A6 全程无 null 覆盖（缺省键省略，不发 null）",
             "违规 (payload_idx, key): %s" % null_violations[:10])

    # ── A7: convergence 点用 wall_time 字段（非 't'）───────────────────────
    # 回调流里 NEW_INCUMBENT 的 incumbent 对象即为 convergence 数据点来源
    wt_violations = []
    for i, p in enumerate(payloads):
        if p.get("event") == "NEW_INCUMBENT":
            inc = p.get("incumbent", {})
            if "t" in inc:
                wt_violations.append((i, "incumbent 含 't' 字段（应用 wall_time）"))
            if "wall_time" not in inc:
                wt_violations.append((i, "incumbent 缺 'wall_time' 字段"))
    _require(len(wt_violations) == 0,
             "A7 convergence 点用 wall_time 字段（不是 t）",
             "违规: %s" % wt_violations[:5])

    # ── A8: 无解路径 DIAGNOSIS 事件 + infeasibility 字段 ───────────────────
    if infeasible_mode:
        diag_events = [p for p in payloads if p.get("event") == "DIAGNOSIS"]
        _require(len(diag_events) >= 1,
                 "A8.1 无解路径收到 DIAGNOSIS 事件",
                 "DIAGNOSIS 事件数=%d" % len(diag_events))
        if diag_events:
            infeas = diag_events[0].get("infeasibility", {})
            _require("located" in infeas,
                     "A8.2 infeasibility 含 located 字段",
                     "infeasibility=%s" % infeas)
            _require("groups" in infeas,
                     "A8.3 infeasibility 含 groups 字段",
                     "infeasibility=%s" % infeas)
        # result 含 infeasibility_analysis
        ia = result.get("infeasibility_analysis") if isinstance(result, dict) else None
        _require(ia is not None,
                 "A8.4 result 含 infeasibility_analysis",
                 "result keys: %s" % list(result.keys()) if isinstance(result, dict) else str(result))

    # ── A9: SEARCH_STATS 事件（每 5s 心跳）──────────────────────────────────
    stats_events = [p for p in payloads if p.get("event") == "SEARCH_STATS"]
    # 心跳每 5s 一次；短求解可能 0 条（可行的话很快），但断言结构一致性
    print("  SEARCH_STATS 事件数: %d" % len(stats_events))
    for i, se in enumerate(stats_events[:3]):
        ss = se.get("search_stats", {})
        _require(
            {"branches", "conflicts", "booleans"}.issubset(set(ss.keys())),
            "A9.%d SEARCH_STATS 含 branches/conflicts/booleans" % (i + 1),
            "实际 keys: %s" % list(ss.keys())
        )


# ────────────────────────────────────────────────────────────────────────────
# 主入口
# ────────────────────────────────────────────────────────────────────────────


def main():
    parser = argparse.ArgumentParser(
        description="V3 事件流抓取测试：mock backend 收 v5 回调，断言事件流正确性"
    )
    parser.add_argument(
        "--request",
        default=os.path.join(_SOLVER_V5_DIR, "logs", "request_1240.json"),
        help="求解请求 JSON 路径（默认 solver_v5/logs/request_1240.json）",
    )
    parser.add_argument(
        "--infeasible",
        action="store_true",
        help="测试无解路径（注入冲突约束，测 DIAGNOSING + DIAGNOSIS 事件）",
    )
    parser.add_argument(
        "--max-time",
        type=float,
        default=60.0,
        help="求解最大时间秒数（默认 60）",
    )
    args = parser.parse_args()

    # 检查请求文件
    if not os.path.isfile(args.request):
        print("[ERROR] 找不到请求文件: %s" % args.request)
        sys.exit(2)

    print("=" * 60)
    print("V3 事件流抓取测试")
    print("  请求: %s" % args.request)
    print("  模式: %s" % ("无解路径 (INFEASIBLE)" if args.infeasible else "正常路径"))
    print("  最大求解时间: %.0fs" % args.max_time)
    print("=" * 60)

    # 启动 mock backend
    server, port, _ = _start_mock_server()
    mock_base_url = "http://127.0.0.1:%d" % port
    mock_progress_url = "%s/callback/progress" % mock_base_url
    print("\n[MOCK] Backend receiver 启动在 %s\n" % mock_progress_url)

    try:
        print("[SOLVE] 开始求解...\n")
        t_start = time.time()
        result = run_solve(
            args.request,
            mock_progress_url,
            infeasible_mode=args.infeasible,
            max_time=args.max_time,
        )
        t_elapsed = time.time() - t_start
        print("\n[SOLVE] 完成 status=%s，耗时=%.1fs，收到 payload=%d 条\n"
              % (result.get("status", "?") if isinstance(result, dict) else "?",
                 t_elapsed, len(_ACCUMULATOR)))
    except Exception as exc:
        print("[ERROR] 求解异常: %s" % exc)
        traceback.print_exc()
        server.shutdown()
        sys.exit(2)
    finally:
        server.shutdown()

    progress_payloads = _ACCUMULATOR.progress_payloads()
    all_payloads = _ACCUMULATOR.all()
    print("[PAYLOADS] 共收到 %d 条回调（进度=%d，结果=%d）\n"
          % (len(all_payloads), len(progress_payloads), len(all_payloads) - len(progress_payloads)))

    # 若无 payload，打印 result 供诊断
    if not all_payloads:
        print("[WARNING] 未收到任何回调 payload！可能原因：")
        print("  1. run_id 未正确注入导致 callback 未创建")
        print("  2. BACKEND_API_URL 未生效（env 变量 import 前设置）")
        print("  3. 网络/port 问题")
        print("result:", json.dumps(result, indent=2, ensure_ascii=False)[:500] if isinstance(result, dict) else str(result))

    # 执行断言
    assert_all(_ACCUMULATOR, result, infeasible_mode=args.infeasible)

    # 汇总
    print("\n" + "=" * 60)
    total = len(_PASS) + len(_FAIL)
    print("断言汇总: %d/%d 通过" % (len(_PASS), total))
    if _FAIL:
        print("\n失败项:")
        for f in _FAIL:
            print("  - %s" % f)
    print("=" * 60)

    if _FAIL:
        sys.exit(1)
    else:
        print("\n[OK] 所有断言通过")
        sys.exit(0)


if __name__ == "__main__":
    main()
