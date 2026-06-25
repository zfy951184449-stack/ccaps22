"""
排产引擎(Production Scheduler)服务
Port: 5007

排产 ≠ 排班。这是把批次/操作排到设备与时间上的「排产」引擎,与 solver_v4/v5(排班)
完全独立。v1 = 纯传播,无求解器(STN + time-table),不引 CP-SAT(D19/C9)。

第一刀只暴露一个端点:CIP 容量尖峰分析,用来复现并验证 WBP2486 的 Day5=16。
权威设计:docs/production_scheduling/{10,40,50}_*.md。
"""

import logging
import os
import sys

from flask import Flask, jsonify, request
from flask_cors import CORS

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from contracts.request import CipPeakRequest
from core.timetable import analyze

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("prod_scheduler")

app = Flask(__name__)
CORS(app)

VERSION = "0.1.0-alpha"


@app.route("/api/prod/health", methods=["GET"])
def health_check():
    return jsonify({"status": "ok", "version": VERSION, "service": "Production Scheduler"})


@app.route("/api/prod/v1/cip-peak", methods=["POST"])
def cip_peak_endpoint():
    """
    CIP 容量尖峰分析。
    入参:已解析到 CIP 站的清洗操作列表(由后端 ProdDataAssembler 组装)。
    出参:全站汇总并发峰值 + 逐日峰值(尖峰数字)、逐站峰值。
    """
    try:
        payload = request.get_json(silent=True)
        if payload is None:
            return jsonify({"error": "空请求体"}), 400

        req = CipPeakRequest.from_dict(payload)
        result = analyze(
            req.intervals(),
            capacity_by_station=req.capacity_by_station,
            default_capacity=req.default_capacity,
            day_hours=req.day_hours,
        )
        result["status"] = "ok"
        result["operation_count"] = len(req.operations)
        logger.info(
            "cip-peak: ops=%d overall_peak=%s",
            len(req.operations),
            result["overall"]["peak_concurrency"],
        )
        return jsonify(result)

    except (KeyError, ValueError, TypeError) as e:
        logger.error("cip-peak 校验错误: %s", e)
        return jsonify({"error": str(e), "type": "VALIDATION_ERROR"}), 400
    except Exception as e:  # noqa: BLE001
        logger.exception("cip-peak 内部错误: %s", e)
        return jsonify({"error": str(e), "type": "INTERNAL_ERROR"}), 500


def main():
    port = int(os.environ.get("PORT", os.environ.get("PROD_SCHEDULER_PORT", 5007)))
    debug = os.environ.get("FLASK_DEBUG", "0") == "1"
    logger.info("Starting Production Scheduler on port %d", port)
    app.run(host="0.0.0.0", port=port, debug=debug)


if __name__ == "__main__":
    main()
