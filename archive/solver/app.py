"""
求解器 Flask 应用入口

提供 HTTP API 接口供后端调用。
"""

import os
import sys
import logging
from datetime import datetime
from flask import Flask, request, jsonify
from flask_cors import CORS

# 添加 solver 目录到 Python 路径
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from core.solver import Solver, solve
from core.segmented_solver import SegmentedSolver, is_apple_silicon, get_optimal_worker_count
from contracts.request import SolverRequest
from contracts.response import SolverResponse

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

# 创建 Flask 应用
app = Flask(__name__)
CORS(app)

# 版本信息
VERSION = "2.0.0"


@app.route("/api/health", methods=["GET"])
def health_check():
    """健康检查接口"""
    from datetime import datetime
    return jsonify({
        "status": "ok",
        "version": VERSION,
        "timestamp": datetime.utcnow().isoformat() + "Z",
    })


@app.route("/api/v2/system-info", methods=["GET"])
def system_info_endpoint():
    """系统信息接口
    
    返回求解器系统信息，包括 CPU 类型和优化配置。
    """
    import platform
    import os
    
    return jsonify({
        "version": VERSION,
        "platform": {
            "system": platform.system(),
            "machine": platform.machine(),
            "processor": platform.processor(),
            "python_version": platform.python_version(),
        },
        "cpu": {
            "total_cores": os.cpu_count(),
            "is_apple_silicon": is_apple_silicon(),
            "optimal_workers": get_optimal_worker_count(),
        },
        "solver_modes": {
            "standard": "整体求解（适用于短期排班）",
            "segmented": "分段求解（适用于长期排班，支持并行）",
        },
    })


@app.route("/api/v2/solve-segmented", methods=["POST"])
def solve_segmented_endpoint():
    """分段求解接口
    
    使用分段求解器处理长时间窗口的排班问题。
    支持 Apple M 系列芯片优化。
    """
    try:
        payload = request.get_json()
        if not payload:
            return jsonify({
                "error": "请求体不能为空",
                "status": "ERROR",
            }), 400
        
        logger.info(f"[API] 收到分段求解请求: request_id={payload.get('request_id', 'N/A')}")
        
        # 解析配置（可选）
        segment_config = payload.pop("segment_config", None)
        
        # 创建求解请求
        req = SolverRequest.from_dict(payload)
        
        # 创建分段求解器
        from core.segmented_solver import SegmentedSolverConfig
        config = None
        if segment_config:
            config = SegmentedSolverConfig(
                segment_days=segment_config.get("segment_days", 14),
                overlap_days=segment_config.get("overlap_days", 7),
                enable_parallel=segment_config.get("enable_parallel", True),
                enable_dynamic_boundary=segment_config.get("enable_dynamic_boundary", True),
            )
        
        solver = SegmentedSolver(config)
        result = solver.solve(req)
        
        # 返回结果
        status_code = 200 if result.status in ("OPTIMAL", "SUBOPTIMAL", "FEASIBLE") else 422
        return jsonify(result.to_dict()), status_code
        
    except ValueError as e:
        logger.warning(f"[API] 分段求解参数错误: {e}")
        return jsonify({
            "error": f"参数错误: {str(e)}",
            "status": "ERROR",
        }), 400
        
    except Exception as e:
        logger.exception(f"[API] 分段求解失败: {e}")
        return jsonify({
            "error": f"内部错误: {str(e)}",
            "status": "ERROR",
        }), 500


@app.route("/api/v2/solve", methods=["POST"])
def solve_endpoint():
    """求解接口
    
    接收完整的求解请求，返回求解结果。
    """
    try:
        # 解析请求
        payload = request.get_json()
        if not payload:
            return jsonify({
                "error": "请求体不能为空",
                "status": "ERROR",
            }), 400
        
        logger.info(f"[API] 收到求解请求: request_id={payload.get('request_id', 'N/A')}")
        
        # 执行求解
        result = solve(payload)
        
        # 返回结果
        status_code = 200 if result.get("status") in ("OPTIMAL", "FEASIBLE") else 422
        return jsonify(result), status_code
        
    except ValueError as e:
        logger.warning(f"[API] 请求参数错误: {e}")
        return jsonify({
            "error": f"参数错误: {str(e)}",
            "status": "ERROR",
        }), 400
        
    except Exception as e:
        logger.exception(f"[API] 求解失败: {e}")
        return jsonify({
            "error": f"内部错误: {str(e)}",
            "status": "ERROR",
        }), 500


# 存储正在运行的求解任务（用于中断）
_running_tasks = {}  # request_id -> {"callback": SolverCallback, "solver": Solver}


@app.route("/api/v2/solve-stream", methods=["POST"])
def solve_stream_endpoint():
    """流式求解接口 (Server-Sent Events)
    
    接收求解请求，返回 SSE 流式进度更新。
    """
    import json
    import queue
    import threading
    from flask import Response
    from core.solver import SolverCallback
    
    payload = request.get_json()
    if not payload:
        return jsonify({"error": "请求体不能为空"}), 400
    
    request_id = payload.get('request_id', 'N/A')
    logger.info(f"[API] 收到流式求解请求: request_id={request_id}")
    
    # 创建进度队列
    progress_queue = queue.Queue()
    result_holder = {"result": None, "error": None, "callback": None}
    
    def progress_callback(progress_data):
        """将进度放入队列"""
        progress_queue.put({"type": "progress", "data": progress_data})
    
    def run_solver():
        """在后台线程中运行求解器"""
        try:
            req = SolverRequest.from_dict(payload)
            solver = Solver()
            
            # 注册到运行中任务列表
            _running_tasks[request_id] = {"solver": solver}
            
            result = solver.solve(req, progress_callback=progress_callback)
            result_holder["result"] = result.to_dict()
        except Exception as e:
            logger.exception(f"[API] 流式求解失败: {e}")
            result_holder["error"] = str(e)
        finally:
            # 从运行中任务列表移除
            _running_tasks.pop(request_id, None)
            progress_queue.put({"type": "done"})
    
    # 启动求解线程
    solver_thread = threading.Thread(target=run_solver)
    solver_thread.start()
    
    def generate():
        """生成 SSE 事件流"""
        while True:
            try:
                # 等待进度更新（最多1秒）
                item = progress_queue.get(timeout=1.0)
                
                if item["type"] == "progress":
                    yield f"event: progress\ndata: {json.dumps(item['data'])}\n\n"
                elif item["type"] == "done":
                    # 等待线程完成
                    solver_thread.join(timeout=5.0)
                    
                    if result_holder["error"]:
                        yield f"event: error\ndata: {json.dumps({'error': result_holder['error']})}\n\n"
                    else:
                        yield f"event: complete\ndata: {json.dumps(result_holder['result'])}\n\n"
                    break
                    
            except queue.Empty:
                # 发送心跳
                yield f"event: heartbeat\ndata: {json.dumps({'timestamp': datetime.utcnow().isoformat()})}\n\n"
    
    return Response(
        generate(),
        mimetype='text/event-stream',
        headers={
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no',  # 禁用 nginx 缓冲
        }
    )


@app.route("/api/v2/abort/<request_id>", methods=["POST"])
def abort_solve_endpoint(request_id: str):
    """中断求解接口
    
    请求中断正在进行的求解任务，并返回当前最优解。
    
    注意：中断会在求解器下次找到解时生效，可能不会立即停止。
    """
    if request_id not in _running_tasks:
        return jsonify({
            "success": False,
            "error": f"未找到运行中的求解任务: {request_id}",
        }), 404
    
    task = _running_tasks[request_id]
    solver = task.get("solver")
    
    if solver and hasattr(solver, 'callback') and solver.callback:
        solver.callback.request_abort()
        logger.info(f"[API] 已请求中断求解任务: {request_id}")
        return jsonify({
            "success": True,
            "message": "已请求中断，将在下次找到解时停止并返回当前最优解",
        })
    else:
        return jsonify({
            "success": False,
            "error": "无法中断：求解器尚未开始或已完成",
        }), 400


@app.route("/api/v2/running", methods=["GET"])
def running_tasks_endpoint():
    """获取正在运行的求解任务列表"""
    return jsonify({
        "running_tasks": list(_running_tasks.keys()),
        "count": len(_running_tasks),
    })


@app.route("/api/v2/validate", methods=["POST"])
def validate_endpoint():
    """验证请求接口
    
    验证请求数据格式是否正确，不执行实际求解。
    """
    try:
        payload = request.get_json()
        if not payload:
            return jsonify({
                "valid": False,
                "errors": ["请求体不能为空"],
            }), 400
        
        errors = []
        
        # 验证必需字段
        required_fields = [
            "request_id",
            "window",
            "operation_demands",
            "employee_profiles",
            "calendar",
            "shift_definitions",
        ]
        
        for field in required_fields:
            if field not in payload:
                errors.append(f"缺少必需字段: {field}")
        
        # 验证 window
        window = payload.get("window", {})
        if not window.get("start_date"):
            errors.append("window.start_date 不能为空")
        if not window.get("end_date"):
            errors.append("window.end_date 不能为空")
        
        # 验证列表不为空
        if not payload.get("operation_demands"):
            errors.append("operation_demands 不能为空")
        if not payload.get("employee_profiles"):
            errors.append("employee_profiles 不能为空")
        if not payload.get("shift_definitions"):
            errors.append("shift_definitions 不能为空")
        
        if errors:
            return jsonify({
                "valid": False,
                "errors": errors,
            }), 400
        
        # 尝试创建请求对象
        try:
            req = SolverRequest.from_dict(payload)
            return jsonify({
                "valid": True,
                "summary": {
                    "operations": len(req.operation_demands),
                    "employees": len(req.employee_profiles),
                    "days": len(req.calendar) if req.calendar else 0,
                    "shifts": len(req.shift_definitions),
                },
            })
        except Exception as e:
            return jsonify({
                "valid": False,
                "errors": [f"数据解析失败: {str(e)}"],
            }), 400
            
    except Exception as e:
        logger.exception(f"[API] 验证失败: {e}")
        return jsonify({
            "valid": False,
            "errors": [f"内部错误: {str(e)}"],
        }), 500


@app.errorhandler(404)
def not_found(e):
    """404 处理"""
    return jsonify({
        "error": "接口不存在",
        "status": "ERROR",
    }), 404


@app.errorhandler(500)
def internal_error(e):
    """500 处理"""
    return jsonify({
        "error": "服务器内部错误",
        "status": "ERROR",
    }), 500


def main():
    """主函数"""
    port = int(os.environ.get("SOLVER_PORT", 5001))
    debug = os.environ.get("FLASK_DEBUG", "0") == "1"
    
    logger.info(f"[Solver] 启动求解器服务 v{VERSION} on port {port}")
    app.run(host="0.0.0.0", port=port, debug=debug)


if __name__ == "__main__":
    main()

