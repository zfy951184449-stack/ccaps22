"""
Objective Function Base Module

Abstract base class for all V4 objective functions.
Follows the same modular pattern as constraints/.
"""
from abc import ABC, abstractmethod
from ortools.sat.python import cp_model
from typing import Dict, Any, Optional
import logging


class ObjectiveBase(ABC):
    """Abstract base class for all V4 objective functions"""
    
    name: str = "BaseObjective"
    weight: int = 1  # For future multi-objective weighted sum
    
    def __init__(self, logger: logging.Logger = None):
        self.logger = logger or logging.getLogger(f"Objective.{self.name}")
    
    @abstractmethod
    def build_expression(
        self,
        model: cp_model.CpModel,
        shift_assignments: Dict[tuple, cp_model.IntVar],
        data: Any
    ) -> Optional[cp_model.LinearExpr]:
        """
        Construct the objective expression.
        
        Args:
            model: The CP-SAT model
            shift_assignments: Dict mapping (emp_id, date, shift_id) -> BoolVar
            data: SolverRequest or relevant data
            
        Returns:
            LinearExpr to be minimized/maximized, or None if objective cannot be built.
        """
        pass
    
    def log(self, message: str, level: str = "info"):
        """Log with objective context"""
        full_msg = f"[{self.name}] {message}"
        if level == "debug":
            self.logger.debug(full_msg)
        elif level == "warning":
            self.logger.warning(full_msg)
        elif level == "error":
            self.logger.error(full_msg)
        else:
            self.logger.info(full_msg)
