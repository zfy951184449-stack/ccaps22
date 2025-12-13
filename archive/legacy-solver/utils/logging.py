"""日志工具函数"""
import os
import logging
from typing import List

# 求解器根目录（solver/）
SOLVER_ROOT = os.path.normpath(os.path.join(os.path.dirname(__file__), ".."))

# 日志目录
LOG_DIR = os.path.join(SOLVER_ROOT, "logs")

# 确保日志目录存在
os.makedirs(LOG_DIR, exist_ok=True)

# 从环境变量读取日志级别，默认为 WARNING（生产环境减少日志输出）
LOG_LEVEL = os.environ.get("SOLVER_LOG_LEVEL", "WARNING").upper()
DEBUG_ENABLED = LOG_LEVEL == "DEBUG"

# 配置标准日志
logging.basicConfig(
    level=getattr(logging, LOG_LEVEL, logging.WARNING),
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger("solver")


def get_log_path(filename: str) -> str:
    """获取日志文件的完整路径
    
    Args:
        filename: 日志文件名（如 debug_input.log）
    
    Returns:
        完整的日志文件路径
    """
    return os.path.join(LOG_DIR, filename)


def log_lines(path: str, lines: List[str]) -> None:
    """将多行文本追加到日志文件
    
    Args:
        path: 日志文件路径
        lines: 要写入的行列表
    """
    try:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "a") as f:
            for line in lines:
                f.write(f"{line}\n")
    except Exception:
        pass


def debug_log(filename: str, message: str) -> None:
    """写入调试日志（仅在 DEBUG 模式下）
    
    Args:
        filename: 日志文件名
        message: 日志消息
    """
    if not DEBUG_ENABLED:
        return
    try:
        path = get_log_path(filename)
        with open(path, "a") as f:
            f.write(message + "\n")
    except Exception:
        pass
