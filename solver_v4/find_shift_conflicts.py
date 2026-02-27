
import json
import os
import sys
from collections import defaultdict
from datetime import datetime
from datetime import timedelta

current_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.append(current_dir)

from contracts.request import SolverRequest
from core.index import ShiftIndex, AssignmentIndex
from utils.time_utils import parse_iso_to_unix

def find_shift_conflicts():
    log_file = "logs/request_V4-1768043560473.json"
    if not os.path.exists(log_file):
        print(f"File not found: {log_file}")
        return

    print(f"Loading request from {log_file}...")
    with open(log_file, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    req = SolverRequest.from_dict(data)
    shift_index = ShiftIndex(req)
    
    # 1. Group operations by Beijing Date
    # Note: ShiftAssignment logic effectively bins operations into "Days".
    # An employee has ONE shift for Day D.
    # Operations on Day D must be covered by that shift.
    
    # Map: (emp_id, date_str) -> List of op_ids they are candidate for
    emp_day_ops = defaultdict(list)
    op_info = {}
    
    print("Building operation map...")
    for op in req.operation_demands:
        op_id = op.operation_plan_id
        start_utc = datetime.fromisoformat(op.planned_start.replace('Z', '+00:00'))
        start_bj = start_utc + timedelta(hours=8)
        date_bj = start_bj.strftime('%Y-%m-%d')
        op_start_unix = parse_iso_to_unix(op.planned_start)
        op_end_unix = parse_iso_to_unix(op.planned_end)
        
        # Calculate covering shifts for this operation
        # This mirrors ShiftAssignmentConstraint logic
        covering_shifts = set()
        
        # Check current day shifts
        for s in req.shift_definitions:
            if s.nominal_hours <= 0.01: continue
            
            sh_start, sh_end = shift_index.get_shift_interval(date_bj, s.shift_id)
            if sh_start <= op_start_unix and op_end_unix <= sh_end:
                covering_shifts.add(s.shift_code) # Use code for readability
        
        # Check previous day night shifts
        prev_date = (start_bj - timedelta(days=1)).strftime('%Y-%m-%d')
        for s in req.shift_definitions:
            if not s.is_night_shift: continue
            if s.nominal_hours <= 0.01: continue
            
            sh_start, sh_end = shift_index.get_shift_interval(prev_date, s.shift_id)
            if sh_start <= op_start_unix and op_end_unix <= sh_end:
                 # Note: Night shift from prev day counts as "Shift for Prev Day"
                 # But operation is on "Current Day".
                 # Actually, constraint logic says:
                 # If using Night Shift of Prev Day, checking `shifts_by_emp_day[(emp_id, prev_date)]`
                 # So we need to store coverage as (date, shift_code)
                 covering_shifts.add(f"PREV_{s.shift_code}")

        op_info[op_id] = {
            "name": op.operation_name,
            "batch": op.batch_code,
            "start": op.planned_start,
            "end": op.planned_end,
            "date_bj": date_bj,
            "prev_date": prev_date,
            "covering_shifts": covering_shifts
        }
        
        # Map candidates -> (date, op_id)
        # Note: We need to care about conflict on "Decision Date".
        # For Day shift, decision date is date_bj. 
        # For Night shift (prev day), decision date is prev_date.
        # If an operation can be covered by Day Shift (Date D) OR Night Shift (Date D-1),
        # then the employee has a choice.
        # Conflict happens if Ops REQUIRE different "Shift Decisions".
        
        for pos in op.position_qualifications:
            for emp_id in pos.candidate_employee_ids:
                emp_day_ops[(emp_id, date_bj)].append(op_id)
                emp_day_ops[(emp_id, prev_date)].append(op_id) # Potentially relevant for night shift
    
    print("Analyzing conflicts...")
    
    # We look for "Constraint Sets"
    # For a fixed employee and a fixed date D:
    # He must pick ONE shift S_choice.
    # All operations he performs must be compatible with that S_choice.
    # An op is compatible with S_choice on Date D if:
    #   (S_choice, D) covers Op
    #   OR Op is on Next Day but (S_choice, D) is a night shift covering it.
    
    # Let's simplify: 
    # For Emp E, Day D:
    # List of possible tasks T1, T2... (where he is a candidate)
    # If he is assigned to {T_a, T_b}, there must exist a Shift S on Day D such that:
    #   S covers T_a AND S covers T_b
    
    # The solver will try to assign him to a subset of tasks.
    # If ANY subset of size >= 1 that is "required" (e.g. valid assignment) has NO common shift, 
    # and he is the ONLY person for those tasks, it's infeasible.
    
    # Since we can't easily know which subset is "required" without solving,
    # we look for the "Exclusive Candidate" case.
    # If Emp E is the ONLY candidate for Op1 and Op2.
    # And Op1 and Op2 have NO common covering shift on Day D.
    # Then impossible. (Unless they fall on different days? No, we iterate per day).
    
    # Refined Logic:
    # Iterate Emp E, Date D.
    # Get all Ops where E is the ONLY candidate. Call this set EssentialOps(E).
    # Filter EssentialOps(E) to those that "touch" Date D (either happen match Day Shift D or Night Shift D).
    # Wait, simple approach:
    # Just look at Op1, Op2 where E is indispensable.
    # If Op1 is morning (needs Day D), Op2 is night (needs Night D).
    # Can E do both?
    # Day Shift covers Op1. Night Shift covers Op2.
    # Common shift? NO.
    # Result: Conflict.
    
    conflicts = []
    
    # Build Indispensable Map
    essential_ops_map = defaultdict(list) # emp_id -> [op_ids]
    for op in req.operation_demands:
        for pos in op.position_qualifications:
            if len(pos.candidate_employee_ids) == 1:
                essential_ops_map[pos.candidate_employee_ids[0]].append(op.operation_plan_id)
    
    for emp_id, op_ids in essential_ops_map.items():
        if len(op_ids) < 2: continue
        
        # Check pairs
        for i in range(len(op_ids)):
            for j in range(i+1, len(op_ids)):
                id1 = op_ids[i]
                id2 = op_ids[j]
                
                info1 = op_info[id1]
                info2 = op_info[id2]
                
                # We only care if they are "close" in time (same or adjacent days)
                # If they are far apart, they don't conflict on shift assignment generally (unless consecutive constraint)
                # Check for shared "Decision Day"
                
                # Shifts covering Op1
                # Format: "DAY", "night", "PREV_night"
                shifts1 = info1['covering_shifts']
                shifts2 = info2['covering_shifts']
                
                # Determine relevant decision dates for Op1
                # If coverage is "DAY" (Standard), it relates to Date_BJ of Op1.
                # If coverage is "PREV_night", it relates to (Date_BJ - 1).
                
                # We need to find if there is a conflict on ANY Decision Date.
                
                # Conflict logic:
                # Op1 requires Shift choice on Day X. Op2 requires Shift choice on Day X.
                # Choices are incompatible.
                
                # Let's verify compatibility on Day X.
                # Valid shifts for Op1 on Day X: {S | (S, X) covers Op1}
                # Valid shifts for Op2 on Day X: {S | (S, X) covers Op2}
                
                # We need to gather dates involved.
                dates_involved = set()
                dates_involved.add(info1['date_bj'])
                dates_involved.add(info1['prev_date'])
                dates_involved.add(info2['date_bj'])
                dates_involved.add(info2['prev_date'])
                
                for date in dates_involved:
                    # Get shifts on this date that cover Op1
                    # A shift S covers Op1 AND is on 'date' IF:
                    #   (S is Day shift OR Night shift) AND date == info1['date_bj'] AND 'Code' in shifts1
                    #   OR (S is Night shift) AND date == info1['prev_date'] AND 'PREV_Code' in shifts1
                    # Wait, simpler:
                    
                    def get_covering_shifts_on_date(info, check_date):
                        res = set()
                        for tag in info['covering_shifts']:
                            if tag.startswith("PREV_"):
                                # This is a night shift on info['prev_date']
                                if info['prev_date'] == check_date:
                                    res.add(tag.replace("PREV_", ""))
                            else:
                                # This is a shift on info['date_bj']
                                if info['date_bj'] == check_date:
                                    res.add(tag)
                        return res
                    
                    s1 = get_covering_shifts_on_date(info1, date)
                    s2 = get_covering_shifts_on_date(info2, date)
                    
                    # If BOTH ops require a shift on this date (i.e. sets are non-empty),
                    # AND the intersection is empty...
                    if s1 and s2:
                        intersection = s1.intersection(s2)
                        if not intersection:
                            # CONFLICT FOUND on 'date'
                            # Op1 needs one of s1. Op2 needs one of s2.
                            # No overlap.
                            conflicts.append({
                                "emp_id": emp_id,
                                "date": date,
                                "op1": info1,
                                "op2": info2,
                                "s1": list(s1),
                                "s2": list(s2)
                            })
    
    print(f"Found {len(conflicts)} confirmed conflicts.")
    if len(conflicts) > 0:
        print("Sample Conflicts:")
        for c in conflicts[:3]:
            print(f"Emp {c['emp_id']} on {c['date']}:")
            print(f"  Op1: {c['op1']['name']} ({c['op1']['start']}~{c['op1']['end']}) needs {c['s1']}")
            print(f"  Op2: {c['op2']['name']} ({c['op2']['start']}~{c['op2']['end']}) needs {c['s2']}")
            print("-" * 30)

if __name__ == "__main__":
    find_shift_conflicts()
