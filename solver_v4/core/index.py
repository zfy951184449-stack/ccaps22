"""
Assignment Index Module

Pre-built indexes for fast lookups during constraint application.
Converts O(N) dictionary iteration to O(1) hashmap lookups.
"""

from collections import defaultdict
from ortools.sat.python import cp_model
from typing import Dict, List, Tuple, Set, TYPE_CHECKING, Optional
if TYPE_CHECKING:
    from contracts.request import SolverRequest
from utils.time_utils import combine_date_time_to_unix



class AssignmentIndex:
    """
    Pre-built indexes for the assignments dictionary.
    
    Usage:
        index = AssignmentIndex(assignments)
        vars_for_op_emp = index.get_vars_for_op_emp(op_id, emp_id)
        all_ops_for_emp = index.get_ops_for_emp(emp_id)
    """
    
    def __init__(self, assignments: Dict[Tuple[int, int, int], cp_model.IntVar]):
        """
        Build all indexes from assignments dictionary.
        
        Args:
            assignments: Dict mapping (op_id, pos_num, emp_id) -> BoolVar
        """
        # Index 1: (op_id, emp_id) -> [(pos_num, var)]
        # For finding all positions an employee can take in an operation
        self._by_op_emp: Dict[Tuple[int, int], List[Tuple[int, cp_model.IntVar]]] = defaultdict(list)
        
        # Index 2: emp_id -> [(op_id, pos_num, var)]
        # For finding all assignments for a specific employee
        self._by_emp: Dict[int, List[Tuple[int, int, cp_model.IntVar]]] = defaultdict(list)
        
        # Index 3: op_id -> [(pos_num, emp_id, var)]
        # For finding all assignments for a specific operation
        self._by_op: Dict[int, List[Tuple[int, int, cp_model.IntVar]]] = defaultdict(list)
        
        # Index 4: op_id -> Set[emp_id]
        # For quickly looking up all candidate employees for an operation
        self._candidates_by_op: Dict[int, Set[int]] = defaultdict(set)
        
        # Build indexes in single pass - O(N)
        for (op_id, pos_num, emp_id), var in assignments.items():
            self._by_op_emp[(op_id, emp_id)].append((pos_num, var))
            self._by_emp[emp_id].append((op_id, pos_num, var))
            self._by_op[op_id].append((pos_num, emp_id, var))
            self._candidates_by_op[op_id].add(emp_id)
    
    def get_vars_for_op_emp(self, op_id: int, emp_id: int) -> List[cp_model.IntVar]:
        """Get all assignment variables for a specific (operation, employee) pair."""
        return [var for (_, var) in self._by_op_emp.get((op_id, emp_id), [])]
    
    def get_all_for_op_emp(self, op_id: int, emp_id: int) -> List[Tuple[int, cp_model.IntVar]]:
        """Get all (pos_num, var) tuples for a specific (operation, employee) pair."""
        return self._by_op_emp.get((op_id, emp_id), [])
    
    def get_assignments_for_emp(self, emp_id: int) -> List[Tuple[int, int, cp_model.IntVar]]:
        """Get all (op_id, pos_num, var) tuples for a specific employee."""
        return self._by_emp.get(emp_id, [])
    
    def get_ops_for_emp(self, emp_id: int) -> Set[int]:
        """Get all operation IDs an employee is a candidate for."""
        return {op_id for (op_id, _, _) in self._by_emp.get(emp_id, [])}
    
    def get_assignments_for_op(self, op_id: int) -> List[Tuple[int, int, cp_model.IntVar]]:
        """Get all (pos_num, emp_id, var) tuples for a specific operation."""
        return self._by_op.get(op_id, [])
    
    def get_candidates_for_op(self, op_id: int) -> Set[int]:
        """Get all candidate employee IDs for a specific operation."""
        return self._candidates_by_op.get(op_id, set())
    
    def get_all_employees(self) -> Set[int]:
        """Get all unique employee IDs."""
        return set(self._by_emp.keys())
    
    def get_all_operations(self) -> Set[int]:
        """Get all unique operation IDs."""
        return set(self._by_op.keys())


class ShiftIndex:
    """
    Index for shift-employee-day relationships and time coverage.
    """
    
    def __init__(self, data: 'SolverRequest'):
        self.shift_map = {s.shift_id: s for s in data.shift_definitions}
        
        # 工作班次列表 (nominal_hours > 0.01 视为工作班次，否则为 REST)
        self.working_shifts = [s for s in data.shift_definitions if s.nominal_hours > 0.01]
        self.rest_shifts = [s for s in data.shift_definitions if s.nominal_hours <= 0.01]
            
        # Cache for shift intervals: (date, shift_id) -> (start_ts, end_ts)
        self._interval_cache = {}
        
    def get_shift_interval(self, date_str: str, shift_id: int) -> Tuple[int, int]:
        """
        Get the unix timestamp interval for a shift on a specific date.
        Handles night shift crossing (e.g. 22:00 on Day D -> 06:00 on Day D+1)
        """
        key = (date_str, shift_id)
        if key in self._interval_cache:
            return self._interval_cache[key]
            
        shift = self.shift_map.get(shift_id)
        if not shift:
            return (0, 0)
        
        # Use existing utility
        start_ts = combine_date_time_to_unix(date_str, shift.start_time)
        end_ts = combine_date_time_to_unix(date_str, shift.end_time, next_day=shift.is_night_shift)
        
        self._interval_cache[key] = (start_ts, end_ts)
        return (start_ts, end_ts)

    def get_covering_shifts(self, op_start: int, op_end: int, window_dates: List[str]) -> List[Tuple[str, int]]:
        """
        Find all shifts that FULLY enclose the operation time range [op_start, op_end].
        Returns a list of keys: (date_str, shift_id).
        
        Args:
            op_start: Operation start timestamp (Unix, UTC)
            op_end: Operation end timestamp (Unix, UTC)
            window_dates: List of dates (YYYY-MM-DD) to check against.
                          Ideally this should be the full solve window.
        """
        covering_shifts = []
        
        for date_str in window_dates:
            for s in self.working_shifts:
                sh_start, sh_end = self.get_shift_interval(date_str, s.shift_id)
                
                # Robust Coverage Check:
                # Shift must start before or at op_start AND end after or at op_end
                if sh_start <= op_start and op_end <= sh_end:
                    covering_shifts.append((date_str, s.shift_id))
                    
            # Also check if any 'Night Shift' from the previous day covers this
            # (Although iterating all window_dates covers most cases, 
            # we must ensure we check the boundary correctly.)
            # The simple loop above "for date_str in window_dates" covers everything 
            # IF window_dates includes the 'logical shift date'.
            
        return covering_shifts

    def get_valid_shifts_for_op(self, op_start: int, op_end: int, date_str: str) -> List[int]:
        """
        [DEPRECATED] Use get_covering_shifts instead.
        Find all working shifts on 'date_str' that cover the operation [op_start, op_end].
        Working shift = nominal_hours > 0.01
        """
        valid_ids = []
        
        for s in self.working_shifts:
            sh_start, sh_end = self.get_shift_interval(date_str, s.shift_id)
            if sh_start <= op_start and op_end <= sh_end:
                valid_ids.append(s.shift_id)
                
        return valid_ids
