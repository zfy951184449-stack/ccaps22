"""
Solver V4 Service
Port: 5005

Clean slate implementation using OR-Tools CP-SAT.
"""

import os
import sys
import time
from flask import Flask, request, jsonify
from flask_cors import CORS

# Add current directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from contracts.request import SolverRequest
from core.solver import SolverV4
from utils.logger import setup_logging, get_logger, SolveRunLogger

# Initialize Logging (Console + File)
setup_logging()
logger = get_logger("App")

app = Flask(__name__)
CORS(app)

VERSION = "4.0.0-alpha"

@app.route("/api/v4/health", methods=["GET"])
def health_check():
    return jsonify({
        "status": "ok",
        "version": VERSION,
        "service": "Solver V4"
    })

@app.route("/api/v4/precheck", methods=["POST"])
def precheck_endpoint():
    """
    Pre-check endpoint: run input validation without starting solver.
    Returns structured issues (errors + warnings).
    """
    try:
        from core.precheck import run_precheck

        payload = request.get_json()
        if not payload:
            return jsonify({"error": "Empty payload"}), 400

        req = SolverRequest.from_dict(payload)
        issues = run_precheck(req)

        # Convert PrecheckIssue dataclasses to dicts
        checks = []
        for issue in issues:
            checks.append({
                "status": issue.severity,
                "check_name": issue.check_name,
                "message": issue.message,
                "details": issue.details,
            })

        # Determine overall status
        has_errors = any(c["status"] == "ERROR" for c in checks)
        has_warnings = any(c["status"] == "WARNING" for c in checks)
        overall_status = "ERROR" if has_errors else ("WARNING" if has_warnings else "PASS")

        return jsonify({
            "status": overall_status,
            "checks": checks,
            "total_checks": len(checks),
        })

    except ValueError as e:
        logger.error(f"Precheck Validation Error: {e}")
        return jsonify({"error": str(e), "type": "VALIDATION_ERROR"}), 400
    except Exception as e:
        logger.exception(f"Precheck Internal Error: {e}")
        return jsonify({"error": str(e), "type": "INTERNAL_ERROR"}), 500

# Global registry for active callbacks
ACTIVE_CALLBACKS = {}

@app.route("/api/v4/abort/<request_id>", methods=["POST"])
def abort_run(request_id):
    """
    Forcefully abort a running solver task.
    Looks up the active Callback for this run_id and triggers stop.
    """
    try:
        request_id = str(request_id)
        callback = ACTIVE_CALLBACKS.get(request_id)
        
        if callback:
             callback.request_stop(reason="API Abort Request")
             logger.info(f"🛑 Abort signal sent to Run {request_id}")
             # We can't easily wait for it to actually stop here without blocking, so just return success
             return jsonify({"success": True, "message": "Abort signal sent"})
        else:
             logger.warning(f"⚠️ No active callback found for Run {request_id} to abort. Active: {list(ACTIVE_CALLBACKS.keys())}")
             return jsonify({"error": "Run not found or not active"}), 404
             
    except Exception as e:
        logger.error(f"Abort failed: {e}")
        return jsonify({"error": str(e)}), 500

@app.route("/api/v4/solve", methods=["POST"])
def solve_endpoint():
    """
    V4 Solve Endpoint.
    Expects JSON matching SolverRequest contract.
    """
    import json
    start_time = time.time()
    request_id = "unknown"
    
    try:
        payload = request.get_json()
        if not payload:
            return jsonify({"error": "Empty payload"}), 400

        # 🔧 FIX: Prioritize config.metadata.run_id (set by Backend) over payload.request_id
        config = payload.get('config', {})
        metadata = config.get('metadata', {})
        request_id = str(metadata.get('run_id') or payload.get('request_id', 'N/A'))
        
        # Create run-specific logger
        run_log = SolveRunLogger(request_id)

        
        # Save request JSON to logs directory for debugging
        logs_dir = os.path.join(os.path.dirname(__file__), "logs")
        os.makedirs(logs_dir, exist_ok=True)
        request_file = os.path.join(logs_dir, f"request_{request_id}.json")
        with open(request_file, 'w', encoding='utf-8') as f:
            json.dump(payload, f, ensure_ascii=False, indent=2)
        run_log.info(f"📁 Saved request JSON to: {request_file}")

        # 1. Parse Request
        req = SolverRequest.from_dict(payload)
        
        # Log request summary
        run_log.start(
            operation_count=len(req.operation_demands),
            employee_count=len(req.employee_profiles)
        )
        run_log.section("请求详情", [
            f"时间窗口: {req.window.get('start_date')} ~ {req.window.get('end_date')}",
            f"共享组: {len(req.shared_preferences)}",
            f"班次定义: {len(req.shift_definitions)}",
        ])
        
        # Log config toggles
        config = req.config or {}
        enabled_constraints = [k for k, v in config.items() if k.startswith("enable_") and v]
        disabled_constraints = [k for k, v in config.items() if k.startswith("enable_") and not v]
        if enabled_constraints or disabled_constraints:
            run_log.section("约束配置", [
                f"启用: {', '.join(enabled_constraints) or '全部默认'}",
                f"禁用: {', '.join(disabled_constraints) or '无'}"
            ])
        
        # 2. Solve (Passing ACTIVE_CALLBACKS registry to allow registration)
        # Note: We need to modify SolverV4 to accept this registry or handle it here
        # Easier approach: Pass a callback_registry dict to SolverV4.solve
        solver = SolverV4()
        
        # Pass registry so Solver can register its callback
        # We need to ensure 'request_id' (run_id) is consistent
        # SolverV4 extracts run_id from config['metadata']['run_id'] usually.
        # Let's verify metadata matches
        if not req.config:
            req.config = {}
        if "metadata" not in req.config:
            req.config["metadata"] = {}
        req.config["metadata"]["registry"] = ACTIVE_CALLBACKS # Injection!
        req.config["metadata"]["run_id"] = request_id # Ensure ID matches
        
        try:
            result = solver.solve(req)
        finally:
            # Cleanup registry (Critical to avoid memory leaks)
            if request_id in ACTIVE_CALLBACKS:
                del ACTIVE_CALLBACKS[request_id]
        
        # 3. Log result
        duration = time.time() - start_time
        run_log.end(
            status=result.get("status", "UNKNOWN"),
            duration_seconds=duration,
            metrics=result.get("metrics")
        )
        
        # [PATCH] Inject duration into result metrics for Frontend
        if "metrics" not in result:
            result["metrics"] = {}
        result["metrics"]["solve_time"] = round(duration, 4)
        
        # 4. Return
        return jsonify(result)

    except ValueError as e:
        logger.error(f"[{request_id}] Validation Error: {e}")
        return jsonify({"error": str(e), "type": "VALIDATION_ERROR"}), 400
    except Exception as e:
        logger.exception(f"[{request_id}] Internal Error: {e}")
        return jsonify({"error": str(e), "type": "INTERNAL_ERROR"}), 500

def main():
    port = int(os.environ.get("PORT", os.environ.get("SOLVER_V4_PORT", 5005)))
    debug = os.environ.get("FLASK_DEBUG", "0") == "1"
    logger.info(f"Starting Solver V4 on port {port}")
    app.run(host="0.0.0.0", port=port, debug=debug)

if __name__ == "__main__":
    main()
