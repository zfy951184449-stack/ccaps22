"""
BaseConstraint — Abstract base for all V4 constraint modules.

Unified apply() signature: apply(ctx: SolverContext, data: SolverRequest) -> int
"""

from abc import ABC, abstractmethod
from typing import Any
import logging

from core.context import SolverContext
from contracts.request import SolverRequest


class BaseConstraint(ABC):
    """Abstract base class for all V4 constraint modules."""

    name: str = "BaseConstraint"
    config_key: str = ""           # Config toggle key, e.g. "enable_share_group"
    default_enabled: bool = True   # Whether enabled when config_key is absent

    def __init__(self, logger: logging.Logger = None):
        self.logger = logger or logging.getLogger(f"Constraint.{self.name}")

    @abstractmethod
    def apply(self, ctx: SolverContext, data: SolverRequest) -> int:
        """
        Apply constraint(s) to ctx.model.

        Args:
            ctx:  SolverContext containing model, assignments, indices, and config.
            data: SolverRequest containing business data (demands, employees, etc.)

        Returns:
            Number of constraints added.
        """
        ...

    def log(self, message: str, level: str = "info"):
        """Log with constraint context prefix."""
        full_msg = f"[{self.name}] {message}"
        getattr(self.logger, level, self.logger.info)(full_msg)
