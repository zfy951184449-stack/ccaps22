"""
SolverContext — Unified parameter container for all constraint and objective modules.

Eliminates inconsistent apply() signatures by bundling all solver state into one object.
"""

from dataclasses import dataclass, field
from typing import Dict, Optional, Any
from ortools.sat.python import cp_model
from core.index import AssignmentIndex, ShiftIndex


@dataclass
class SolverContext:
    """All solver state that constraints and objectives may need."""

    model: cp_model.CpModel
    assignments: Dict[tuple, cp_model.IntVar]
    index: AssignmentIndex

    # Shift layer (None when window/shift_definitions absent)
    shift_assignments: Dict[tuple, cp_model.IntVar] = field(default_factory=dict)
    shift_index: Optional[ShiftIndex] = None

    # Vacancy layer
    vacancy_vars: Dict[tuple, cp_model.IntVar] = field(default_factory=dict)

    # Task Placement layer (for Flexible tasks)
    task_placements: Dict[tuple, cp_model.IntVar] = field(default_factory=dict)

    # Parsed config dict (from req.config)
    config: Dict[str, Any] = field(default_factory=dict)
