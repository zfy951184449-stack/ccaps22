"""
Verification Script: Night Shift Rest Constraint (Simplified)

Tests the NightRestConstraint with isolated, minimal scenarios.
"""

import sys
import os
import logging

sys.path.append(os.getcwd())
sys.path.append(os.path.join(os.getcwd(), "solver_v4"))

from solver_v4.core.solver import SolverV4
from solver_v4.contracts.request import SolverRequest

# Mute most logs
logging.getLogger("SolverV4.Core").setLevel(logging.WARNING)
logging.getLogger("Constraint.NightRest").setLevel(logging.DEBUG)


def create_simple_request():
    """Minimal request with day and night shift options"""
    return {
        "request_id": "test_night_rest",
        "window": {"start_date": "2024-01-01", "end_date": "2024-01-03"},
        "config": {
            "enforce_night_rest": True,
            "night_rest_hard_days": 1,
            "max_consecutive_work_days": 6  # High limit to not interfere
        },
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
                "shift_id": 2,
                "shift_code": "N",
                "shift_name": "Night",
                "start_time": "22:00",
                "end_time": "06:00",
                "nominal_hours": 8,
                "is_night_shift": True,
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
            {"employee_id": 1, "employee_code": "E1", "employee_name": "W1", "qualifications": [], "unavailable_periods": []},
            {"employee_id": 2, "employee_code": "E2", "employee_name": "W2", "qualifications": [], "unavailable_periods": []}
        ],
        "operation_demands": [],
        "shared_preferences": [],
        "historical_shifts": []
    }


def run_scenario(name, req_data, expect_status):
    print(f"\n{'='*60}")
    print(f"Scenario: {name}")
    print(f"{'='*60}")
    try:
        req = SolverRequest.from_dict(req_data)
        solver = SolverV4()
        result = solver.solve(req)
        
        status = result.get('status')
        print(f"Result Status: {status}")
        
        if status == expect_status or (expect_status == "FEASIBLE" and status == "OPTIMAL"):
            print("✅ PASS")
            return True
        else:
            print(f"❌ FAIL: Expected {expect_status}, got {status}")
            return False
            
    except Exception as e:
        print(f"Runtime Error: {e}")
        import traceback
        traceback.print_exc()
        return False


def run_tests():
    print("\n🧪 Night Rest Constraint - Simplified Tests\n")
    results = []
    
    # Test 1: Historical night on Dec 31, only candidate for Day 1 op -> INFEASIBLE
    print("Test 1: Historical Night (Should Fail)")
    data1 = create_simple_request()
    data1["historical_shifts"] = [
        {"employee_id": 1, "date": "2023-12-31", "is_work": True, "is_night": True}
    ]
    data1["operation_demands"] = [{
        "operation_plan_id": 1,
        "batch_id": 1,
        "batch_code": "B1",
        "operation_id": 1,
        "operation_name": "Day1Op",
        "planned_start": "2024-01-01T09:00:00",
        "planned_end": "2024-01-01T12:00:00",
        "planned_duration_minutes": 180,
        "required_people": 1,
        "position_qualifications": [{"position_number": 1, "candidate_employee_ids": [1]}]
    }]
    results.append(run_scenario("Historical Night Dec31, Work Jan1 (x=1)", data1, "INFEASIBLE"))

    # Test 2: Historical night on Dec 31, different candidate for Day 1 op -> FEASIBLE
    print("\nTest 2: Historical Night, Different Worker (Should Pass)")
    data2 = create_simple_request()
    data2["historical_shifts"] = [
        {"employee_id": 1, "date": "2023-12-31", "is_work": True, "is_night": True}
    ]
    data2["operation_demands"] = [{
        "operation_plan_id": 1,
        "batch_id": 1,
        "batch_code": "B1",
        "operation_id": 1,
        "operation_name": "Day1Op",
        "planned_start": "2024-01-01T09:00:00",
        "planned_end": "2024-01-01T12:00:00",
        "planned_duration_minutes": 180,
        "required_people": 1,
        "position_qualifications": [{"position_number": 1, "candidate_employee_ids": [2]}]  # Employee 2
    }]
    results.append(run_scenario("Historical Night E1, Work E2 Jan1", data2, "FEASIBLE"))

    # Test 3: Constraint disabled, historical night -> FEASIBLE
    print("\nTest 3: Constraint Disabled (Should Pass)")
    data3 = create_simple_request()
    data3["config"]["enforce_night_rest"] = False
    data3["historical_shifts"] = [
        {"employee_id": 1, "date": "2023-12-31", "is_work": True, "is_night": True}
    ]
    data3["operation_demands"] = [{
        "operation_plan_id": 1,
        "batch_id": 1,
        "batch_code": "B1",
        "operation_id": 1,
        "operation_name": "Day1Op",
        "planned_start": "2024-01-01T09:00:00",
        "planned_end": "2024-01-01T12:00:00",
        "planned_duration_minutes": 180,
        "required_people": 1,
        "position_qualifications": [{"position_number": 1, "candidate_employee_ids": [1]}]
    }]
    results.append(run_scenario("Constraint DISABLED", data3, "FEASIBLE"))

    # Summary
    print("\n" + "=" * 60)
    passed = sum(results)
    print(f"Results: {passed}/{len(results)} passed")
    if passed == len(results):
        print("🎉 All tests passed!")
    else:
        print("⚠️ Some tests failed.")


if __name__ == "__main__":
    run_tests()
