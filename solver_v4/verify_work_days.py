import sys
import os
import logging
from copy import deepcopy

# Add current dir to path
sys.path.append(os.getcwd())
sys.path.append(os.path.join(os.getcwd(), "solver_v4")) 

from solver_v4.core.solver import SolverV4
from solver_v4.contracts.request import SolverRequest
import json

# Setup logging
# logging.basicConfig(level=logging.INFO)
# Mute solver internal logs for clearer test output
logging.getLogger("SolverV4.Core").setLevel(logging.WARNING)

def create_base_request():
    return {
        "request_id": "test_consecutive",
        "window": {"start_date": "2024-01-01", "end_date": "2024-01-07"},
        "config": {"max_consecutive_work_days": 6},
        "calendar": [],
        "shift_definitions": [
            {
                "shift_id": 1,
                "shift_code": "D",
                "shift_name": "Day",
                "start_time": "08:00",
                "end_time": "16:00",
                "nominal_hours": 8,
                "is_night_shift": False,
                "plan_category": "PRODUCTION"
            },
            {
                "shift_id": 99,
                "shift_code": "OFF",
                "shift_name": "Rest",
                "start_time": "00:00",
                "end_time": "00:00",
                "nominal_hours": 0,
                "is_night_shift": False,
                "plan_category": "REST"
            }
        ],
        "employee_profiles": [
            {
                "employee_id": 1,
                "employee_code": "E1",
                "employee_name": "Worker1",
                "qualifications": [],
                "unavailable_periods": []
            }
        ],
        "operation_demands": [],
        "shared_preferences": []
    }

def add_ops(req_data, num_days=7, candidate_ids=[1]):
    ops = []
    for i in range(1, num_days + 1):
        date_str = f"2024-01-0{i}"
        ops.append({
            "operation_plan_id": i,
            "batch_id": 1,
            "batch_code": "B1",
            "operation_id": i,
            "operation_name": f"Op_Day_{i}",
            "planned_start": f"{date_str}T09:00:00",
            "planned_end": f"{date_str}T12:00:00",
            "planned_duration_minutes": 180,
            "required_people": 1,
            "position_qualifications": [
                {
                    "position_number": 1,
                    "candidate_employee_ids": candidate_ids
                }
            ]
        })
    req_data["operation_demands"] = ops

def run_scenario(name, req_data, expect_status):
    print(f"\n--- Scenario: {name} ---")
    try:
        req = SolverRequest.from_dict(req_data)
        solver = SolverV4()
        result = solver.solve(req)
        
        status = result.get('status')
        print(f"Result Status: {status}")
        
        if status == expect_status or (expect_status == "FEASIBLE" and status == "OPTIMAL"):
            print("✅ PASS")
        else:
            print(f"❌ FAIL: Expected {expect_status}, got {status}")
            
    except Exception as e:
        print(f"Runtime Error: {e}")

def run_tests():
    print("🧪 Verification Suite: Max Consecutive Work Days")
    
    # Scene 1: 1 Emp, 7 Days, Limit 6 -> INFEASIBLE
    data1 = create_base_request()
    add_ops(data1, num_days=7, candidate_ids=[1])
    data1["config"]["max_consecutive_work_days"] = 6
    run_scenario("1 Emp, 7 Ops, Limit 6 (Should Fail)", data1, "INFEASIBLE")

    # Scene 2: 1 Emp, 7 Days, Limit 7 -> FEASIBLE
    data2 = create_base_request()
    add_ops(data2, num_days=7, candidate_ids=[1])
    data2["config"]["max_consecutive_work_days"] = 7
    run_scenario("1 Emp, 7 Ops, Limit 7 (Should Pass)", data2, "FEASIBLE")
    
    # Scene 3: 2 Emps, 7 Days, Limit 6 -> FEASIBLE (Load Balancing)
    data3 = create_base_request()
    data3["employee_profiles"].append({
        "employee_id": 2,
        "employee_code": "E2",
        "employee_name": "Worker2",
        "qualifications": [],
        "unavailable_periods": []
    })
    add_ops(data3, num_days=7, candidate_ids=[1, 2])
    data3["config"]["max_consecutive_work_days"] = 6
    run_scenario("2 Emps, 7 Ops, Limit 6 (Should Pass - Split Work)", data3, "FEASIBLE")

if __name__ == "__main__":
    run_tests()
