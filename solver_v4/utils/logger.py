"""
Unified Logging Module for Solver V4

Features:
- Dual output: Console + File
- Daily rotation with 7-day retention
- Structured format with timestamps
- Request-scoped logging context
"""

import os
import logging
import sys
from datetime import datetime
from logging.handlers import TimedRotatingFileHandler

# 日志目录
LOG_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "logs")

# 全局日志格式
LOG_FORMAT = "%(asctime)s [%(levelname)s] [%(name)s] %(message)s"
LOG_DATE_FORMAT = "%Y-%m-%d %H:%M:%S"


def setup_logging(level: str = "INFO") -> logging.Logger:
    """
    Initialize the logging system for Solver V4.
    
    Creates:
    - Console handler (colored output)
    - File handler (daily rotation, 7-day retention)
    
    Returns:
        Root logger for the solver
    """
    # 确保日志目录存在
    os.makedirs(LOG_DIR, exist_ok=True)
    
    # 获取根 logger
    root_logger = logging.getLogger("SolverV4")
    root_logger.setLevel(getattr(logging, level.upper(), logging.INFO))
    
    # 避免重复添加 handler
    if root_logger.handlers:
        return root_logger
    
    # 1. Console Handler
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(logging.INFO)
    console_formatter = logging.Formatter(
        fmt=LOG_FORMAT,
        datefmt=LOG_DATE_FORMAT
    )
    console_handler.setFormatter(console_formatter)
    root_logger.addHandler(console_handler)
    
    # 2. File Handler (Daily Rotation)
    log_filename = os.path.join(LOG_DIR, "solver.log")
    file_handler = TimedRotatingFileHandler(
        filename=log_filename,
        when="midnight",
        interval=1,
        backupCount=7,  # Keep 7 days
        encoding="utf-8"
    )
    file_handler.setLevel(logging.DEBUG)  # File gets more detail
    file_handler.suffix = "%Y%m%d"
    file_formatter = logging.Formatter(
        fmt=LOG_FORMAT,
        datefmt=LOG_DATE_FORMAT
    )
    file_handler.setFormatter(file_formatter)
    root_logger.addHandler(file_handler)
    
    # 启动时记录
    root_logger.info("=" * 60)
    root_logger.info(f"Solver V4 Logging Initialized at {datetime.now().isoformat()}")
    root_logger.info(f"Log directory: {LOG_DIR}")
    root_logger.info("=" * 60)
    
    return root_logger


def get_logger(name: str) -> logging.Logger:
    """
    Get a child logger with the given name.
    
    Args:
        name: Logger name (e.g., "Core", "Constraint.ShareGroup")
    
    Returns:
        Logger instance
    """
    return logging.getLogger(f"SolverV4.{name}")


class SolveRunLogger:
    """
    Context-aware logger for a single solve run.
    Prefixes all messages with the request_id.
    """
    
    def __init__(self, request_id: str):
        self.request_id = request_id or "unknown"
        self.logger = get_logger("Run")
        self._start_time = datetime.now()
        
    def info(self, msg: str):
        self.logger.info(f"[{self.request_id}] {msg}")
        
    def debug(self, msg: str):
        self.logger.debug(f"[{self.request_id}] {msg}")
        
    def warning(self, msg: str):
        self.logger.warning(f"[{self.request_id}] {msg}")
        
    def error(self, msg: str):
        self.logger.error(f"[{self.request_id}] {msg}")
    
    def section(self, title: str, details: list = None):
        """Log a structured section with optional bullet points."""
        self.info(f"📋 {title}")
        if details:
            for line in details:
                self.info(f"   • {line}")
    
    def metric(self, name: str, value):
        """Log a key-value metric."""
        self.info(f"📊 {name}: {value}")
    
    def start(self, operation_count: int, employee_count: int):
        """Log solve run start."""
        self.info("=" * 50)
        self.info(f"🚀 开始求解 | 操作: {operation_count} | 员工: {employee_count}")
        self.info("=" * 50)
    
    def end(self, status: str, duration_seconds: float, metrics: dict = None):
        """Log solve run end with summary."""
        status_emoji = {
            "OPTIMAL": "✅",
            "FEASIBLE": "🟡",
            "INFEASIBLE": "❌",
            "UNKNOWN": "❓",
            "MODEL_INVALID": "🚫"
        }.get(status, "❓")
        
        self.info("=" * 50)
        self.info(f"{status_emoji} 求解完成 | 状态: {status} | 耗时: {duration_seconds:.2f}s")
        if metrics:
            for k, v in metrics.items():
                self.info(f"   • {k}: {v}")
        self.info("=" * 50)
