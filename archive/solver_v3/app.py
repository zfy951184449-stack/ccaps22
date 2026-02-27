"""
V3 模块化高性能求解器 - Flask 应用入口

端口: 5002 (与 V2 的 5001 完全独立)
"""

from flask import Flask, request, jsonify
from flask_cors import CORS

from utils.logger import logger, info, error

# 创建 Flask 应用
app = Flask(__name__)
CORS(app)


@app.route('/api/health', methods=['GET'])
def health_check():
    """健康检查端点"""
    info("健康检查请求")
    return "OK"


@app.route('/api/v3/solve', methods=['POST'])
def solve():
    """
    V3 求解端点
    
    使用 SolverEngine 处理求解请求
    """
    try:
        data = request.get_json() or {}
        info(f"收到求解请求: {len(data.get('operations', []))} 个操作")
        
        # 使用引擎求解
        from core.engine import solve as engine_solve
        response = engine_solve(data)
        
        return jsonify(response.to_dict())
        
    except Exception as e:
        error(f"求解请求处理失败: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({
            "status": "ERROR",
            "message": str(e)
        }), 500


@app.route('/api/v3/info', methods=['GET'])
def info_endpoint():
    """V3 求解器信息端点"""
    return jsonify({
        "name": "V3 模块化高性能求解器",
        "version": "3.0.0-alpha",
        "port": 5002,
        "features": [
            "模块化约束架构",
            "智能抢占优先级",
            "中文日志系统",
            "多目标字典序优化"
        ]
    })


if __name__ == '__main__':
    info("=" * 50)
    info("V3 模块化高性能求解器启动中...")
    info("端口: 5002")
    info("=" * 50)
    
    app.run(host='0.0.0.0', port=5002, debug=True)
