"""
Employee Availability Constraint Module

Ensures employees are not assigned to operations during their unavailable periods.

This is a DEFENSIVE constraint - normally the Backend pre-filters unavailable 
employees from candidate lists. This constraint serves as a safety net to prevent
illegal assignments if data is inconsistent.

NOTE: This constraint does NOT affect shift assignments - employees can still be
assigned shifts (including REST) to satisfy work hour requirements.
"""

from ortools.sat.python import cp_model
from typing import Dict, Any, List, Optional
from constraints.base import BaseConstraint
from contracts.request import SolverRequest
from core.index import AssignmentIndex
from core.context import SolverContext
from utils.time_utils import parse_iso_to_unix
import logging


class EmployeeAvailabilityConstraint(BaseConstraint):
    """
    Employee Availability Constraint (Defensive Hard Constraint)
    
    Logic:
    For each employee with unavailable_periods:
        For each unavailable period [unavail_start, unavail_end]:
            For each operation that overlaps with this period:
                Forbid all assignment variables for (op_id, *, emp_id)
    
    Time Overlap: op.start < unavail.end AND op.end > unavail.start
    """
    
    name = "EmployeeAvailability"
    config_key = "enable_employee_availability"
    default_enabled = True
    is_hard = True
    
    def apply(self, ctx: SolverContext, data: SolverRequest) -> int:
        """Apply employee availability constraints"""
        model = ctx.model
        index = ctx.index
        
        constraints_added = 0
        employees_with_unavail = 0
        
        # Build operation time lookup
        op_times: Dict[int, tuple] = {}
        for op in data.operation_demands:
            op_id = op.operation_plan_id
            op_start = parse_iso_to_unix(op.planned_start)
            op_end = parse_iso_to_unix(op.planned_end)
            op_times[op_id] = (op_start, op_end)
        
        # Process each employee
        for emp in data.employee_profiles:
            if not emp.unavailable_periods:
                continue
            
            employees_with_unavail += 1
            emp_id = emp.employee_id
            
            for period in emp.unavailable_periods:
                unavail_start = parse_iso_to_unix(period.get('start_datetime', ''))
                unavail_end = parse_iso_to_unix(period.get('end_datetime', ''))
                
                if unavail_start == 0 or unavail_end == 0:
                    self.log(f"Invalid unavailable period for Emp {emp_id}: {period}", level="warning")
                    continue
                
                # Find overlapping operations
                for op_id, (op_start, op_end) in op_times.items():
                    # Overlap check: op.start < unavail.end AND op.end > unavail.start
                    if op_start < unavail_end and op_end > unavail_start:
                        # Forbid assignment
                        vars_to_forbid = index.get_vars_for_op_emp(op_id, emp_id)
                        
                        for var in vars_to_forbid:
                            model.Add(var == 0)
                            constraints_added += 1
        
        if employees_with_unavail > 0:
            self.log(f"Processed {employees_with_unavail} employees with unavailable periods.")
        self.log(f"Total availability constraints: {constraints_added}")
        
        return constraints_added
