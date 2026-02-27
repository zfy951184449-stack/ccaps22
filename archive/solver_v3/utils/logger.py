"""
V3 求解器日志系统

提供完善的中文日志和错误报告功能。
"""

import logging
import sys
from datetime import datetime
from typing import Optional


class ChineseFormatter(logging.Formatter):
    """中文日志格式化器"""
    
    LEVELS = {
        'DEBUG': '调试',
        'INFO': '信息',
        'WARNING': '警告',
        'ERROR': '错误',
        'CRITICAL': '严重'
    }
    
    def format(self, record: logging.LogRecord) -> str:
        # 获取中文级别名称
        level_name = self.LEVELS.get(record.levelname, record.levelname)
        
        # 格式化时间
        timestamp = datetime.fromtimestamp(record.created).strftime('%Y-%m-%d %H:%M:%S')
        
        # 构建消息
        message = f"[{timestamp}] [{level_name}] {record.getMessage()}"
        
        # 如果有异常信息，追加
        if record.exc_info:
            message += f"\n{self.formatException(record.exc_info)}"
            
        return message


def get_logger(name: str = "solver_v3", level: int = logging.DEBUG) -> logging.Logger:
    """
    获取配置好的日志器
    
    Args:
        name: 日志器名称
        level: 日志级别
        
    Returns:
        配置好的 Logger 实例
    """
    logger = logging.getLogger(name)
    
    # 避免重复添加 handler
    if logger.handlers:
        return logger
    
    logger.setLevel(level)
    
    # 控制台 handler (中文格式)
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(level)
    console_handler.setFormatter(ChineseFormatter())
    logger.addHandler(console_handler)
    
    # 文件 handler (可选)
    try:
        file_handler = logging.FileHandler('solver_v3.log', encoding='utf-8')
        file_handler.setLevel(logging.DEBUG)
        file_handler.setFormatter(ChineseFormatter())
        logger.addHandler(file_handler)
    except Exception:
        pass  # 文件日志可选，失败不影响运行
    
    return logger


# 默认日志器实例
logger = get_logger()


# 便捷函数
def debug(msg: str, *args, **kwargs):
    """调试日志"""
    logger.debug(msg, *args, **kwargs)


def info(msg: str, *args, **kwargs):
    """信息日志"""
    logger.info(msg, *args, **kwargs)


def warning(msg: str, *args, **kwargs):
    """警告日志"""
    logger.warning(msg, *args, **kwargs)


def error(msg: str, *args, **kwargs):
    """错误日志"""
    logger.error(msg, *args, **kwargs)


def critical(msg: str, *args, **kwargs):
    """严重错误日志"""
    logger.critical(msg, *args, **kwargs)
