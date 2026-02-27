"""
实时日志收集器

线程安全的日志收集器，用于将求解过程中的关键事件实时推送到前端 LiveLog。
"""

from __future__ import annotations
import threading
import time
from typing import List, Dict, Any, Optional
from dataclasses import dataclass, field
from enum import Enum


class LogLevel(str, Enum):
    """日志级别"""
    INFO = "INFO"
    SUCCESS = "SUCCESS"
    WARNING = "WARNING"
    ERROR = "ERROR"


class LogCategory(str, Enum):
    """日志分类"""
    GENERAL = "GENERAL"         # 通用消息
    CONSTRAINT = "CONSTRAINT"   # 约束构建
    CONFLICT = "CONFLICT"       # 冲突检测
    SOLVER = "SOLVER"           # 求解器状态
    PROGRESS = "PROGRESS"       # 进度更新


@dataclass
class LogEntry:
    """单条日志条目"""
    timestamp: float              # Unix 时间戳
    message: str                  # 日志消息
    level: str = LogLevel.INFO.value
    category: str = LogCategory.GENERAL.value
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "timestamp": self.timestamp,
            "time": time.strftime("%H:%M:%S", time.localtime(self.timestamp)),
            "message": self.message,
            "level": self.level,
            "category": self.category,
        }


class LiveLogger:
    """实时日志收集器 - 线程安全
    
    用于收集求解过程中的关键事件，并通过 SSE 推送到前端。
    
    Usage:
        logger = LiveLogger()
        logger.log("✅ 资质约束: 120 个约束", level="SUCCESS", category="CONSTRAINT")
        
        # 获取所有日志（用于 SSE 推送）
        all_logs = logger.get_logs()
        
        # 获取增量日志（减少带宽）
        new_logs = logger.get_latest(since_index=10)
    """
    
    def __init__(self, max_entries: int = 500):
        """初始化日志收集器
        
        Args:
            max_entries: 最大保留的日志条目数，超过后自动清理旧日志
        """
        self._logs: List[LogEntry] = []
        self._lock = threading.Lock()
        self._max_entries = max_entries
        self._start_time = time.time()
    
    def log(
        self,
        message: str,
        level: str = LogLevel.INFO.value,
        category: str = LogCategory.GENERAL.value,
    ) -> None:
        """添加一条日志
        
        Args:
            message: 日志消息
            level: 日志级别 (INFO, SUCCESS, WARNING, ERROR)
            category: 日志分类 (GENERAL, CONSTRAINT, CONFLICT, SOLVER, PROGRESS)
        """
        entry = LogEntry(
            timestamp=time.time(),
            message=message,
            level=level,
            category=category,
        )
        
        with self._lock:
            self._logs.append(entry)
            
            # 自动清理旧日志
            if len(self._logs) > self._max_entries:
                self._logs = self._logs[-self._max_entries:]
    
    def info(self, message: str, category: str = LogCategory.GENERAL.value) -> None:
        """记录 INFO 级别日志"""
        self.log(message, LogLevel.INFO.value, category)
    
    def success(self, message: str, category: str = LogCategory.GENERAL.value) -> None:
        """记录 SUCCESS 级别日志"""
        self.log(message, LogLevel.SUCCESS.value, category)
    
    def warning(self, message: str, category: str = LogCategory.GENERAL.value) -> None:
        """记录 WARNING 级别日志"""
        self.log(message, LogLevel.WARNING.value, category)
    
    def error(self, message: str, category: str = LogCategory.GENERAL.value) -> None:
        """记录 ERROR 级别日志"""
        self.log(message, LogLevel.ERROR.value, category)
    
    def constraint(self, message: str, level: str = LogLevel.SUCCESS.value) -> None:
        """约束模块专用日志"""
        self.log(message, level, LogCategory.CONSTRAINT.value)
    
    def conflict(self, message: str, level: str = LogLevel.WARNING.value) -> None:
        """冲突检测专用日志"""
        self.log(message, level, LogCategory.CONFLICT.value)
    
    def solver(self, message: str, level: str = LogLevel.INFO.value) -> None:
        """求解器状态专用日志"""
        self.log(message, level, LogCategory.SOLVER.value)
    
    def get_logs(self) -> List[Dict[str, Any]]:
        """获取所有日志（字典格式）
        
        Returns:
            日志列表，每条日志包含 timestamp, time, message, level, category
        """
        with self._lock:
            return [entry.to_dict() for entry in self._logs]
    
    def get_latest(self, since_index: int = 0) -> List[Dict[str, Any]]:
        """获取增量日志
        
        Args:
            since_index: 从该索引开始获取新日志
            
        Returns:
            新增的日志列表
        """
        with self._lock:
            if since_index >= len(self._logs):
                return []
            return [entry.to_dict() for entry in self._logs[since_index:]]
    
    def get_messages_only(self) -> List[str]:
        """仅获取消息字符串列表（兼容旧接口）"""
        with self._lock:
            return [entry.message for entry in self._logs]
    
    @property
    def count(self) -> int:
        """当前日志条目数"""
        with self._lock:
            return len(self._logs)
    
    @property
    def elapsed_time(self) -> float:
        """从创建到现在的耗时（秒）"""
        return time.time() - self._start_time
    
    def clear(self) -> None:
        """清空所有日志"""
        with self._lock:
            self._logs.clear()
