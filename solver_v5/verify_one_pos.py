import requests
import json
import time

URL = "http://localhost:5005/api/v4/solve"

# Test Case:
# Op1 has 2 positions.
# Emp1 is candidate for BOTH positions.
# Expectation: Emp1 is assigned to AT MOST 1 position (or Infeasible if both required and only 1 emp).
# To make it Feasible but verify uniqueness, we need:
# - Op1 requires 1 person (Wait, required_people usually equals positions? No, positions are distinct slots).
# - Usually positions > required_people? OR positions == required_people.
# If Op requires 2 people, and we only have Emp1, it should be INFEASIBLE. 
# If Op requires 1 person but has 2 positions? (Rare).
# Let's try: Op requires 2 people. Pos 1 and Pos 2.
# We give Emp1 (cand for both) and Emp2 (cand for Pos 2).
# Result should be: Emp1 -> Pos 1, Emp2 -> Pos 2. 
# NOT: Emp1 -> Pos 1 AND Emp1 -> Pos 2.

payload = {
    "request_id": "verify_one_pos",
    "window": {"start_date": "2023-10-27", "end_date": "2023-10-27"},
    "operation_demands": [
        {
            "operation_plan_id": 201,
            "batch_id": 1,
            "batch_code": "B1",
            "operation_id": 1,
            "operation_name": "MultiPosOp",
            "planned_start": "2023-10-27T10:00:00",
            "planned_end": "2023-10-27T12:00:00",
            "planned_duration_minutes": 120,
            "required_people": 2, # Needs 2 people
            "position_qualifications": [
                {
                    "position_number": 1,
                    "qualifications": [],
                    "candidate_employee_ids": [1] # Emp 1 only
                },
                {
                    "position_number": 2,
                    "qualifications": [],
                    "candidate_employee_ids": [1, 2] # Emp 1 and Emp 2
                }
            ]
        }
    ],
    "employee_profiles": [
        {
            "employee_id": 1, "employee_code": "E1", "employee_name": "Emp1", "qualifications": [], "unavailable_periods": []
        },
        {
            "employee_id": 2, "employee_code": "E2", "employee_name": "Emp2", "qualifications": [], "unavailable_periods": []
        }
    ],
    "calendar": [],
    "shift_definitions": [],
    "shared_preferences": []
}

def verify():
    print("Sending One Pos verification request...")
    try:
        resp = requests.post(URL, json=payload, timeout=5)
        resp.raise_for_status()
        data = resp.json()
        
        print(f"Status: {data.get('status')}")
        assignments = data.get('assignments', [])
        
        # Check Emp 1 assignments
        emp1_assigns = [a for a in assignments if a['employee_id'] == 1]
        print(f"Emp 1 Assignments: {len(emp1_assigns)}")
        
        if len(emp1_assigns) > 1:
            print("❌ FAIL: Emp 1 assigned to multiple positions!")
        else:
            print("✅ PASS: Emp 1 assigned to at most 1 position.")
            
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    verify()
