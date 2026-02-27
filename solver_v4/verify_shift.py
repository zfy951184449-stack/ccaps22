import requests
import json
import time

URL = "http://localhost:5005/api/v4/solve"

# Test Case:
# 1. Op1 (Day Op): Day 1 09:00 - 17:00. Requires PRODUCTION shift.
# 2. Emp1 covers Op1. Should get Day Shift (PRODUCTION).
# 3. Emp2 has NO operations. Should get REST Shift (REST) or some shift.
# 4. Op2 (Night Op): Day 2 02:00 - 05:00. Requires Night Shift from Day 1?
#    Start: 10/28 02:00.
#    Night Shift (103): 22:00 - 06:00.
#    If assigned to Day 1 (10/27), covers 10/27 22:00 - 10/28 06:00. COVERS.
#    If assigned to Day 2 (10/28), covers 10/28 22:00 - 10/29 06:00. NO COVER.
#    So Op2 must be covered by Shift on 10/27.

payload = {
    "request_id": "verify_shift",
    "window": {"start_date": "2023-10-27", "end_date": "2023-10-28"}, 
    "operation_demands": [
        {
            "operation_plan_id": 301,
            "batch_id": 1, "batch_code": "B1",
            "operation_id": 1, "operation_name": "DayOp",
            # Day 1: 10/27
            "planned_start": "2023-10-27T09:00:00",
            "planned_end": "2023-10-27T17:00:00",
            "planned_duration_minutes": 480,
            "required_people": 1,
            "position_qualifications": [{"position_number": 1, "qualifications": [], "candidate_employee_ids": [1]}]
        },
        {
            "operation_plan_id": 302,
            "batch_id": 1, "batch_code": "B1",
            "operation_id": 2, "operation_name": "NightOp",
            # Day 2: 10/28 (Early morning)
            "planned_start": "2023-10-28T02:00:00",
            "planned_end": "2023-10-28T05:00:00",
            "planned_duration_minutes": 180,
            "required_people": 1,
            "position_qualifications": [{"position_number": 1, "qualifications": [], "candidate_employee_ids": [2]}]
        }
    ],
    "employee_profiles": [
        {"employee_id": 1, "employee_code": "E1", "employee_name": "Emp1_Day", "qualifications": [], "unavailable_periods": []},
        {"employee_id": 2, "employee_code": "E2", "employee_name": "Emp2_Night", "qualifications": [], "unavailable_periods": []},
        {"employee_id": 3, "employee_code": "E3", "employee_name": "Emp3_Rest", "qualifications": [], "unavailable_periods": []}
    ],
    "calendar": [],
    "shift_definitions": [
        {
            "shift_id": 101, "shift_code": "Day", "shift_name": "Day Shift",
            "start_time": "08:00", "end_time": "20:00", "nominal_hours": 12, "is_night_shift": False,
            "plan_category": "PRODUCTION"
        },
        {
            "shift_id": 102, "shift_code": "Night", "shift_name": "Night Shift",
            "start_time": "20:00", "end_time": "08:00", "nominal_hours": 12, "is_night_shift": True,
            "plan_category": "PRODUCTION"
        },
        {
            "shift_id": 999, "shift_code": "REST", "shift_name": "Rest Day",
            "start_time": "00:00", "end_time": "00:00", "nominal_hours": 0, "is_night_shift": False,
            "plan_category": "REST"
        }
    ],
    "shared_preferences": []
}

def verify():
    print("🚀 Sending Verify Request...")
    try:
        resp = requests.post(URL, json=payload, timeout=10)
        resp.raise_for_status()
        data = resp.json()
        
        status = data.get('status')
        print(f"Status: {status}")
        if status != 'FEASIBLE':
             print(f"❌ FAIL: Infeasible! Msg: {data.get('message')}")
             return

        shifts = data.get('shift_schedule', [])
        assignments = data.get('assignments', [])
        
        print(f"Shift Records: {len(shifts)}")
        print(f"Op Assignments: {len(assignments)}")
        
        # --- Check Emp1 (DayOp) ---
        # Emp1 assigned to Op 301 on 10/27.
        # Should have Day Shift (101) on 10/27.
        s1 = next((s for s in shifts if s['employee_id'] == 1 and s['date'] == '2023-10-27'), None)
        if s1 and s1['shift_id'] == 101:
            print("✅ PASS: Emp1 got Day Shift (101) on 10/27")
        else:
            print(f"❌ FAIL: Emp1 Shift on 10/27 is {s1} (Expected 101)")
            
        # --- Check Emp2 (NightOp) ---
        # Op starts 10/28 02:00.
        # Emp2 MUST have Night Shift (102, 20:00-08:00) on 10/27 to cover it.
        s2 = next((s for s in shifts if s['employee_id'] == 2 and s['date'] == '2023-10-27'), None)
        if s2 and s2['shift_id'] == 102:
            print("✅ PASS: Emp2 got Night Shift (102) on 10/27 to cover 02:00 Op")
        else:
            print(f"❌ FAIL: Emp2 Shift on 10/27 is {s2} (Expected 102)")
            
        # --- Check Emp3 (Rest) ---
        # Emp3 has no ops.
        # Should receive a Shift for 10/27 and 10/28?
        # Likely REST shift if optimized cost, or any shift (since no constraint prevents it except maybe implicitly soft constraints?)
        # But we only have hard constraints.
        # So ANY shift is valid. BUT if our logic works, s/he MUST exist in schedule.
        s3 = [s for s in shifts if s['employee_id'] == 3]
        if len(s3) >= 2: # 10/27 and 10/28
            print(f"✅ PASS: Emp3 has {len(s3)} shifts assigned (Full Coverage). Details: {[s['shift_id'] for s in s3]}")
        else:
            print(f"❌ FAIL: Emp3 missing shifts! Found: {len(s3)}")

    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    verify()
