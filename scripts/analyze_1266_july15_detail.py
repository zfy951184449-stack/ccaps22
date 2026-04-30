import json

def analyze():
    request_file = "/Users/zhengfengyi/MFG8APS/solver_v4/logs/request_1266.json"
    with open(request_file, 'r', encoding='utf-8') as f:
        data = json.load(f)

    ops = data.get("operation_demands", [])
    
    print("\n======== Ops on 2026-07-15 Details ========")
    for op in ops:
        planned_start = op.get("planned_start")
        if planned_start and planned_start[:10] == "2026-07-15":
            op_id = op.get("operation_id")
            name = op.get("operation_name")
            end = op.get("planned_end")
            req_ppl = op.get("required_people")
            shift = op.get("shift_type") or "Unknown"
            print(f"ID:{op_id} | Name:{name} | Start:{planned_start[11:16]} End:{end[11:16]} | Ppl:{req_ppl}")
            
    print("\n======== Invalid Duration Ops Details ========")
    invalid_count = 0
    for op in ops:
        op_id = op.get("operation_id")
        if str(op_id).startswith("-"):
            invalid_count += 1
            if invalid_count <= 5:
                print(f"ID:{op_id} | Start:{op.get('planned_start')} | End:{op.get('planned_end')}")

if __name__ == "__main__":
    analyze()
