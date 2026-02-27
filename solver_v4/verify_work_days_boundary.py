"""
Verification Suite: Historical Consecutive Work Days Boundary

Tests that the V4 solver correctly handles pre-window work history
when applying the max consecutive working days constraint.

Test Scenarios:
1. Employee with 5 days pre-history, limit=6 -> First day can work, Day 2 must have flexibility
2. Employee with 6 days pre-history, limit=6 -> First day MUST rest
3. Employee with 0 days pre-history, limit=6 -> Normal behavior
"""

import sys
import os
import logging
from copy import deepcopy

sys.path.append(os.path.join(os.path.dirname(__file__)))

from core.solver import SolverV4
from contracts.request import SolverRequest

# Mute solver internal logs
logging.getLogger("SolverV4.Core").setLevel(logging.WARNING)
logging.getLogger("Constraint.MaxConsecutiveWorkDays").setLevel(logging.INFO)


def create_base_request():
    """Create a base request for 7-day window with 1 employee"""
    return {
        "request_id": "test_boundary",
        "window": {"start_date": "2024-01-07", "end_date": "2024-01-13"},
        "config": {"max_consecutive_work_days": 6},
        "calendar": [],
        "shift_definitions": [
            {
                "shift_id": 1,
                "shift_code": "D",
                "shift_name": "Day Shift",
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
        "shared_preferences": [],
        "historical_shifts": []
    }


def add_ops(req_data, num_days=7, start_day=7, candidate_ids=[1]):
    """Add operations for consecutive days"""
    ops = []
    for i in range(num_days):
        day = start_day + i
        date_str = f"2024-01-{day:02d}"
        ops.append({
            "operation_plan_id": i + 1,
            "batch_id": 1,
            "batch_code": "B1",
            "operation_id": i + 1,
            "operation_name": f"Op_Day_{day}",
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


def add_history(req_data, employee_id: int, consecutive_work_days: int):
    """Add historical shift record"""
    req_data["historical_shifts"] = [
        {
            "employee_id": employee_id,
            "date": "2024-01-06",  # Day before window
            "is_work": True,
            "is_night": False,
            "consecutive_work_days": consecutive_work_days
        }
    ]


def run_scenario(name: str, req_data: dict, expect_status: str) -> bool:
    """Run a single test scenario"""
    print(f"\n{'='*60}")
    print(f"Scenario: {name}")
    print(f"{'='*60}")
    
    try:
        req = SolverRequest.from_dict(req_data)
        solver = SolverV4()
        result = solver.solve(req)
        
        status = result.get('status')
        print(f"Result Status: {status}")
        
        # Check assignments if feasible
        if status in ("FEASIBLE", "OPTIMAL"):
            assignments = result.get('assignments', [])
            print(f"Assignments: {len(assignments)} positions filled")
        
        # Determine pass/fail
        if status == expect_status or (expect_status == "FEASIBLE" and status == "OPTIMAL"):
            print("✅ PASS")
            return True
        else:
            print(f"❌ FAIL: Expected {expect_status}, got {status}")
            return False
            
    except Exception as e:
        print(f"❌ Runtime Error: {e}")
        import traceback
        traceback.print_exc()
        return False


def run_tests():
    print("\n" + "="*60)
    print("🧪 Verification Suite: Historical Work Days Boundary")
    print("="*60)
    
    results = []
    
    # =========================================================
    # Test 1: 5 days history, 7 days window, limit=6
    # Expected: FEASIBLE (can work Day 1, must rest by Day 2)
    # =========================================================
    print("\n[TEST 1] History=5, Window=7 days ops, Limit=6")
    data1 = create_base_request()
    add_ops(data1, num_days=7, candidate_ids=[1])
    add_history(data1, employee_id=1, consecutive_work_days=5)
    # With 5 pre-days, first 2 window days can have max 1 work day
    # But we have 7 ops needing work -> still need 2 employees or adjusted schedule
    # With single employee, this might be INFEASIBLE if solver can't schedule around it
    # Actually, let's add a 2nd employee to make it FEASIBLE
    data1["employee_profiles"].append({
        "employee_id": 2,
        "employee_code": "E2",
        "employee_name": "Worker2",
        "qualifications": [],
        "unavailable_periods": []
    })
    # Update candidates to include both
    for op in data1["operation_demands"]:
        op["position_qualifications"][0]["candidate_employee_ids"] = [1, 2]
    
    results.append(run_scenario("5-day history with 2 employees", data1, "FEASIBLE"))
    
    # =========================================================
    # Test 2: 6 days history, 1 op on Day 1, limit=6
    # Expected: INFEASIBLE (Day 1 must rest, but op needs the only candidate)
    # =========================================================
    print("\n[TEST 2] History=6, Only 1 employee, Op on Day 1, Limit=6")
    data2 = create_base_request()
    add_ops(data2, num_days=1, candidate_ids=[1])  # Only 1 op on first day
    add_history(data2, employee_id=1, consecutive_work_days=6)
    results.append(run_scenario("6-day history, must rest Day 1", data2, "INFEASIBLE"))
    
    # =========================================================
    # Test 3: 0 days history, 7 days window, limit=6
    # Expected: INFEASIBLE (normal constraint kicks in)
    # =========================================================
    print("\n[TEST 3] History=0, 7 ops, Limit=6 (baseline)")
    data3 = create_base_request()
    add_ops(data3, num_days=7, candidate_ids=[1])
    add_history(data3, employee_id=1, consecutive_work_days=0)  # No history
    results.append(run_scenario("No history, 7 ops with 1 emp", data3, "INFEASIBLE"))
    
    # =========================================================
    # Test 4: No history field at all (backward compatibility)
    # =========================================================
    print("\n[TEST 4] No historical_shifts field (backward compat)")
    data4 = create_base_request()
    add_ops(data4, num_days=6, candidate_ids=[1])  # 6 ops = exactly limit
    del data4["historical_shifts"]
    results.append(run_scenario("No history field, 6 ops", data4, "FEASIBLE"))
    
    # =========================================================
    # Summary
    # =========================================================
    print("\n" + "="*60)
    print("📊 Test Summary")
    print("="*60)
    passed = sum(results)
    total = len(results)
    print(f"Passed: {passed}/{total}")
    
    if passed == total:
        print("✅ All tests passed!")
    else:
        print("⚠️  Some tests failed. Review output above.")
    
    return passed == total


if __name__ == "__main__":
    success = run_tests()
    sys.exit(0 if success else 1)
