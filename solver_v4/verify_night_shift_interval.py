
import sys
import os
import logging
import logging
from datetime import datetime, timedelta

sys.path.append(os.getcwd())
sys.path.append(os.path.join(os.getcwd(), "solver_v4"))

from solver_v4.core.solver import SolverV4
from solver_v4.contracts.request import SolverRequest
from solver_v4.constraints.night_shift_interval import NightShiftIntervalConstraint

# Configure logging
logging.basicConfig(level=logging.INFO)
# logging.getLogger("Constraint.NightShiftInterval").setLevel(logging.DEBUG)

def create_base_request(interval=2):
    # Generate calendar
    calendar = []
    start_date = datetime.strptime("2024-01-01", "%Y-%m-%d")
    for i in range(10):
        d = start_date + timedelta(days=i)
        calendar.append({
            "date": d.strftime("%Y-%m-%d"),
            "is_workday": True,
            "is_triple_salary": False
        })

    return {
        "request_id": "test_night_interval",
        "window": {"start_date": "2024-01-01", "end_date": "2024-01-10"},
        "config": {
            "min_night_shift_interval": interval,
            "monthly_hours_lower_offset": 9999,
        },
        "shift_definitions": [
            {"shift_id": 1, "shift_code": "D", "shift_name": "Day", "start_time": "08:00", "end_time": "20:00", "nominal_hours": 12, "is_night_shift": False},
            {"shift_id": 2, "shift_code": "N", "shift_name": "Night", "start_time": "20:00", "end_time": "08:00", "nominal_hours": 12, "is_night_shift": True},
            {"shift_id": 3, "shift_code": "O", "shift_name": "Off", "start_time": "00:00", "end_time": "00:00", "nominal_hours": 0, "is_night_shift": False},
        ],
        "employee_profiles": [
            {"employee_id": 1, "employee_code": "E1", "employee_name": "Worker1", "qualifications": [], "unavailable_periods": []}
        ],
        "calendar": calendar,
        "operation_demands": [],
        "shared_preferences": [],
        "historical_shifts": []
    }

def run_test(name, request_data, expected_status):
    print(f"\n--- Running Test: {name} ---")
    try:
        # Inject position_number into qualifications if missing
        if "operation_demands" in request_data:
            for op in request_data["operation_demands"]:
                if "position_qualifications" in op:
                    for i, pq in enumerate(op["position_qualifications"]):
                         if "position_number" not in pq:
                             pq["position_number"] = i + 1

        req = SolverRequest.from_dict(request_data)
        solver = SolverV4()
        # Only enable NightAssignment and NightShiftInterval to simplify
        # Actually SolverV4 loads all. We can't easily disable others without hacking, 
        # but we can rely on operation demands to force assignments.
        
        result = solver.solve(req)
        status = result.get("status")
        print(f"Status: {status}")
        
        if status == expected_status or (expected_status == "FEASIBLE" and status == "OPTIMAL"):
            print("✅ PASS")
            return True
        else:
            print(f"❌ FAIL: Expected {expected_status}, Got {status}")
            # If we expected FEASIBLE but got INFEASIBLE, maybe print constraints?
            return False
    except Exception as e:
        print(f"ERROR: {e}")
        import traceback
        traceback.print_exc()
        return False

def main():
    # 1. Basic Test: Interval=2. Force Night on Jan 1 and Jan 2. Should Fail.
    req1 = create_base_request(interval=2)
    # Force assignments via pre-assigned shifts? 
    # V4 doesn't support "pre-assigned" in request easily unless partial solution or history.
    # We will use operation_demands with specific times and specific candidates to FORCE assignments.
    
    # Op1: Jan 1 Night (22:00)
    # Op2: Jan 2 Night (22:00)
    req1["operation_demands"] = [
        {
            "operation_plan_id": 101, "operation_name": "NightOp1", 
            "planned_start": "2024-01-01T22:00:00", "planned_end": "2024-01-02T06:00:00",
            "required_people": 1, "position_qualifications": [{"candidate_employee_ids": [1]}],
            "batch_id": 1, "batch_code": "B1", "operation_id": 101, "planned_duration_minutes": 480
        },
        {
            "operation_plan_id": 102, "operation_name": "NightOp2", 
            "planned_start": "2024-01-02T22:00:00", "planned_end": "2024-01-03T06:00:00",
            "required_people": 1, "position_qualifications": [{"candidate_employee_ids": [1]}],
            "batch_id": 1, "batch_code": "B1", "operation_id": 102, "planned_duration_minutes": 480
        }
    ]
    # We need to map these ops to Shift ID 2 (Night). 
    # The solver usually maps based on time. 22:00 matches Night shift start.
    
    run_test("1. Consecutive Nights (Interval=2) -> Should FAIL", req1, "INFEASIBLE")

    # 2. Basic Test: Interval=2. Night Jan 1, Night Jan 3. Should Pass.
    req2 = create_base_request(interval=2)
    req2["operation_demands"] = [
        {
            "operation_plan_id": 201, "operation_name": "NightOp1", 
            "planned_start": "2024-01-01T22:00:00", "planned_end": "2024-01-02T06:00:00",
            "required_people": 1, "position_qualifications": [{"candidate_employee_ids": [1]}],
            "batch_id": 2, "batch_code": "B2", "operation_id": 201, "planned_duration_minutes": 480
        },
        {
            "operation_plan_id": 203, "operation_name": "NightOp3", 
            "planned_start": "2024-01-03T22:00:00", "planned_end": "2024-01-04T06:00:00",
            "required_people": 1, "position_qualifications": [{"candidate_employee_ids": [1]}],
            "batch_id": 2, "batch_code": "B2", "operation_id": 203, "planned_duration_minutes": 480
        }
    ]
    run_test("2. Spaced Nights (Interval=2, Gap 1 Day) -> Should PASS", req2, "FEASIBLE")

    # 3. Share Group Exemption Bug Check
    # Scenario: Interval=2. Night Jan 1, Night Jan 2 (Shared).
    # If exemption works "correctly" (as currently implemented), assignments might be allowed?
    # Or strict interval means NO consecutive nights period.
    # Current implementation exempts shared dates from window count.
    # So if Jan 2 is shared, window [1,2] -> sum(Jan1) <= 1. OK.
    
    req3 = create_base_request(interval=2)
    req3["operation_demands"] = [
        {
            "operation_plan_id": 301, "operation_name": "NightOp1", 
            "planned_start": "2024-01-01T22:00:00", "planned_end": "2024-01-02T06:00:00",
            "required_people": 1, "position_qualifications": [{"candidate_employee_ids": [1]}],
            "batch_id": 3, "batch_code": "B3", "operation_id": 301, "planned_duration_minutes": 480
        },
        {
            "operation_plan_id": 302, "operation_name": "Shared-夜班", 
            "planned_start": "2024-01-02T22:00:00", "planned_end": "2024-01-03T06:00:00",
            "required_people": 1, "position_qualifications": [{"candidate_employee_ids": [1]}],
            "batch_id": 3, "batch_code": "B3", "operation_id": 302, "planned_duration_minutes": 480
        }
    ]
    # Add shared preference for Op 302
    req3["shared_preferences"] = [
        {
            "share_group_id": 1,
            "share_group_name": "Group1",
            "members": [{"operation_plan_id": 302}, {"operation_plan_id": 999}] # Dummy member to make size >= 2
        }
    ]
    
    # If the bug exists (exemption allows consecutive), this will PASS.
    # If the constraint was strict, it should FAIL.
    # The user says "Constraint doesn't work", implying they see consecutive nights when they shouldn't.
    # So if this PASSES, it confirms the exemption loophole is likely the cause (or one cause).
    # 4. Loophole Confirmation with Interval=3 (Avoids NightRest interference)
    # Scenario: Interval=3. Night Jan 1, Off Jan 2, Night Jan 3 (Shared).
    # Window [1,2,3] -> Count = 2. Should Fail.
    # But NightRest (1 day) is satisfied by Off Jan 2.
    # So if this Passes, it is purely due to NightShiftInterval exemption.
    
    req4 = create_base_request(interval=3)
    req4["operation_demands"] = [
        {
            "operation_plan_id": 401, "operation_name": "NightOp1", 
            "planned_start": "2024-01-01T22:00:00", "planned_end": "2024-01-02T06:00:00",
            "required_people": 1, "position_qualifications": [{"candidate_employee_ids": [1]}],
            "batch_id": 4, "batch_code": "B4", "operation_id": 401, "planned_duration_minutes": 480
        },
        {
            "operation_plan_id": 403, "operation_name": "Shared-夜班", 
            "planned_start": "2024-01-03T22:00:00", "planned_end": "2024-01-04T06:00:00",
            "required_people": 1, "position_qualifications": [{"candidate_employee_ids": [1]}],
            "batch_id": 4, "batch_code": "B4", "operation_id": 403, "planned_duration_minutes": 480
        },
        {
            "operation_plan_id": 404, "operation_name": "Shared-Dummy", 
            "planned_start": "2024-01-03T22:00:00", "planned_end": "2024-01-04T06:00:00",
            "required_people": 1, "position_qualifications": [{"candidate_employee_ids": [1]}],
            "batch_id": 4, "batch_code": "B4", "operation_id": 404, "planned_duration_minutes": 480
        }
    ]
    # Add shared preference for Op 403 and Op 404
    req4["shared_preferences"] = [
        {
            "share_group_id": 2,
            "share_group_name": "Group2",
            "members": [{"operation_plan_id": 403}, {"operation_plan_id": 404}] 
        }
    ]
    
    run_test("4. N-O-N (Interval=3) with Exemption Removed -> Should FAIL", req4, "INFEASIBLE")

if __name__ == "__main__":
    main()
