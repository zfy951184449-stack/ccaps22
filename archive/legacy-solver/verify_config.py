
import sys
import os
import json
from datetime import datetime, timedelta

# Add solver directory to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from core.solver import build_assignments_unified

def create_mock_data():
    # 1. Calendar: 2025-10-01 (Wed) to 2025-10-07 (Tue)
    # 10-01 to 10-03 are holidays (Triple Salary)
    # 10-04 (Sat), 10-05 (Sun) are non-workdays
    # 10-06 (Mon), 10-07 (Tue) are workdays
    calendar = []
    for d in range(1, 8):
        date_str = f"2025-10-{d:02d}"
        is_workday = d >= 6 # Only 6, 7 are workdays
        is_triple = d <= 3
        calendar.append({
            "date": date_str,
            "isWorkday": is_workday,
            "isTripleSalary": is_triple,
            "holidayType": "NATIONAL" if is_triple else None
        })

    # 2. Employees: 20 employees
    # 2 Leaders, 18 Frontline
    employees = []
    for i in range(1, 21):
        role = "SHIFT_LEADER" if i <= 2 else "FRONTLINE"
        employees.append({
            "employeeId": i,
            "employeeCode": f"E{i:03d}",
            "employeeName": f"Emp{i}",
            "orgRole": role,
            "qualifications": [{"qualificationId": 1, "level": 1}]
        })

    # 3. Operations: Production on 10-04 (Sat) - Non-workday
    # We want to test Leader Coverage on Non-workday
    operations = []
    # Create 8 operations on 10-04, requiring 1 person each
    # Total workers = 8
    for i in range(8):
        operations.append({
            "operationPlanId": 100 + i,
            "operationCode": f"OP{i}",
            "operationName": "Test Op",
            "plannedStart": "2025-10-04T09:00:00",
            "plannedEnd": "2025-10-04T17:00:00",
            "requiredPeople": 1,
            "qualifications": [{"qualificationId": 1, "minLevel": 1}]
        })

    # 4. Shift Definitions
    shift_definitions = [
        {
            "id": 1,
            "shiftCode": "D",
            "shiftName": "Day",
            "startTime": "09:00:00",
            "endTime": "17:00:00",
            "nominalHours": 8,
            "isCrossDay": False,
            "isNightShift": False
        }
    ]

    return {
        "calendar": calendar,
        "employeeProfiles": employees,
        "operationDemands": operations,
        "shiftDefinitions": shift_definitions,
        "employeeUnavailability": [],
        "sharedPreferences": [],
        "lockedOperations": [],
        "lockedShifts": []
    }

def test_leader_thresholds():
    print("\n=== Testing Leader Thresholds ===")
    payload = create_mock_data()
    
    # Case 1: Default Config (Tier 1 <= 6, Tier 2 <= 10)
    # We have 8 workers. Should fall into Tier 2 (7-10).
    # Ideally 1-2 leaders.
    print("Running with DEFAULT config...")
    payload["config"] = {
        "enforceLeaderPresence": True,
        "leaderTier1Threshold": 6,
        "leaderTier2Threshold": 10
    }
    result = build_assignments_unified(payload)
    
    # Check assignments on 2025-10-04
    assignments = result.get("details", {}).get("assignments", [])
    # We need to check shift vars or inferred assignments.
    # The result structure might not directly show shift types unless we parse logs or check internal vars.
    # However, build_assignments_unified returns a dict. Let's see what it returns.
    # It returns "status", "summary", "details". "details" usually has "assignments".
    # But for shifts (BASE/REST), it might not be in "assignments" (which are op assignments).
    # We might need to rely on the logs printed by the solver or modify the solver to return more info.
    # Wait, I added print statements in solver.py to debug Leader Coverage!
    # "DEBUG: Leader Coverage Verification:"
    # I can capture stderr to check the output.

def test_shift_tolerance():
    print("\n=== Testing Shift Tolerance ===")
    payload = create_mock_data()
    # Modify operation time to be slightly off
    # Shift is 09:00-17:00.
    # Op is 08:35-16:35 (25 mins off).
    # Default tolerance is 30. Should match.
    payload["operationDemands"][0]["plannedStart"] = "2025-10-04T08:35:00"
    payload["operationDemands"][0]["plannedEnd"] = "2025-10-04T16:35:00"
    
    print("Running with Tolerance=30 (Default)...")
    payload["config"] = {"shiftMatchingTolerance": 30}
    # We need to check if it matched "Day" shift or "AUTO_..."
    # This requires checking the output logs or result details.
    
    print("Running with Tolerance=10...")
    payload["config"] = {"shiftMatchingTolerance": 10}
    # Should NOT match "Day" shift.

if __name__ == "__main__":
    test_leader_thresholds()
    # test_shift_tolerance() 
