import requests
import json
import time

URL = "http://localhost:5005/api/v4/solve"

# Test Case:
# Emp1 is candidate for Op1 (10:00-12:00) and Op2 (11:00-13:00).
# Overlap: 11:00-12:00.
# Expectation: Only one should be assigned.

payload = {
    "request_id": "verify_unique_emp",
    "window": {"start_date": "2023-10-27", "end_date": "2023-10-27"},
    "operation_demands": [
        {
            "operation_plan_id": 101,
            "batch_id": 1,
            "batch_code": "B1",
            "operation_id": 1,
            "operation_name": "Op1",
            "planned_start": "2023-10-27T10:00:00",
            "planned_end": "2023-10-27T12:00:00", # Ends 12:00
            "planned_duration_minutes": 120,
            "required_people": 1,
            "position_qualifications": [
                {
                    "position_number": 1,
                    "qualifications": [],
                    "candidate_employee_ids": [1]
                }
            ]
        },
        {
            "operation_plan_id": 102,
            "batch_id": 1,
            "batch_code": "B1",
            "operation_id": 2,
            "operation_name": "Op2",
            "planned_start": "2023-10-27T11:00:00", # Starts 11:00. Overlap!
            "planned_end": "2023-10-27T13:00:00",
            "planned_duration_minutes": 120,
            "required_people": 1,
            "position_qualifications": [
                {
                    "position_number": 1,
                    "qualifications": [],
                    "candidate_employee_ids": [1] # Same employee
                }
            ]
        }
    ],
    "employee_profiles": [
        {
            "employee_id": 1,
            "employee_code": "E1",
            "employee_name": "Test Emp",
            "qualifications": [],
            "unavailable_periods": []
        }
    ],
    "calendar": [],
    "shift_definitions": [],
    "shared_preferences": [] # No share groups, so strict uniqueness applies
}

def verify():
    print("Sending verification request...")
    try:
        resp = requests.post(URL, json=payload, timeout=5)
        resp.raise_for_status()
        data = resp.json()
        
        print(f"Status: {data.get('status')}")
        assignments = data.get('assignments', [])
        print(f"Assignments: {len(assignments)}")
        for a in assignments:
            print(f" - Op {a['operation_id']} -> Emp {a['employee_id']}")
            
        if len(assignments) <= 1:
            print("✅ PASS: Correctly assigned at most 1 operation.")
        else:
            print("❌ FAIL: Assigned multiple operations despite overlap!")
            
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    verify()
