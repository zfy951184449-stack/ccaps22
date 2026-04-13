"""
Balance Night Shifts Objective

Goal: Minimize the variance of night shifts assigned to employees.
Mathematical form: Min Sum((NightCount(e) - TargetAvg)^2)
Alternative (Linear): Min (MaxNight - MinNight) -- often easier but less smooth.
Alternative (L2): Min Sum(NightCount(e)^2). 
Minimizing Sum of Squares (L2 norm) automatically penalizes outliers and tends towards the mean.
Sum(x^2) is minimized when x values are equal (for fixed Sum(x)).
So we just minimize Sum(NightCount(e)^2).

Implementation:
1. Count Night Shifts per employee: N_e
2. Create objective terms: N_e * N_e
   - Requires multiplication? CP-SAT supports `AddMultiplicationEquality` or `AddQuadratic`.
   - Actually simplier: `model.Minimize(sum(n*n for n in counts))` is not directly supported if n is Var.
   - We need variables for squared values?
   - CP-SAT `Minimize` takes a LinearExpr.
   - We can't put Squares in the objective directly if they are variables.
   
   Workaround for L2 minimization in CP-SAT:
   - Use auxiliary variable `squared_count[e]`.
   - `model.AddMultiplicationEquality(squared_count[e], [count[e], count[e]])`
   - Minimize sum(squared_count)
   
   Wait, AddMultiplicationEquality is for IntVars.
   Limit: Count can be 0..31. Square is 0..961. This fits easily in IntVar.
"""

from ortools.sat.python import cp_model
from typing import Dict, Optional, Set
from objectives.base import ObjectiveBase
from contracts.request import SolverRequest

class BalanceNightShiftsObjective(ObjectiveBase):
    name = "BalanceNightShifts"
    
    def __init__(self, logger=None):
        super().__init__(logger)

    def build_expression(
        self,
        model: cp_model.CpModel,
        shift_assignments: Dict[tuple, cp_model.IntVar],
        data: SolverRequest
    ) -> Optional[cp_model.LinearExpr]:
        
        if not shift_assignments:
            return None
            
        # 1. Identify Night Shifts
        night_shift_ids = set()
        if data.shift_definitions:
            for s in data.shift_definitions:
                if s.is_night_shift:
                    night_shift_ids.add(s.shift_id)
        
        if not night_shift_ids:
            return 0
            
        # 2. Pre-group night shift vars by employee (avoid O(E×N) nested loop)
        from collections import defaultdict
        emp_night_map = defaultdict(list)  # emp_id -> [var, ...]
        for (e, d, s), var in shift_assignments.items():
            if s in night_shift_ids:
                emp_night_map[e].append(var)
        
        emp_night_counts = {}
        
        # Initialize for all employees (even those with 0 nights) to ensure balance considers them
        all_employees = {ep.employee_id for ep in data.employee_profiles}
        
        for emp_id in all_employees:
            night_vars = emp_night_map.get(emp_id, [])
            
            if not night_vars:
                emp_night_counts[emp_id] = 0 # Integer 0
            else:
                # Sum variable
                count_var = model.NewIntVar(0, 31, f"NightCount_{emp_id}")
                model.Add(count_var == sum(night_vars))
                emp_night_counts[emp_id] = count_var
                
        # 3. Minimize Sum of Squares (L2 Regularization for Balance)
        squared_vars = []
        
        for emp_id, count in emp_night_counts.items():
            if isinstance(count, int):
                # Constant
                squared_vars.append(count * count)
            else:
                # Variable
                sq_var = model.NewIntVar(0, 31*31, f"NightCountSq_{emp_id}")
                model.AddMultiplicationEquality(sq_var, [count, count])
                squared_vars.append(sq_var)
                
        self.log(f"Built BalanceNightShifts objective with {len(squared_vars)} terms.")
        
        return sum(squared_vars)
