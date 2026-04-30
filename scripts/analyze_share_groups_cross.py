import json
import datetime
from datetime import timezone, timedelta

def analyze():
    request_file = "/Users/zhengfengyi/MFG8APS/solver_v4/logs/request_1266.json"
    with open(request_file, 'r', encoding='utf-8') as f:
        data = json.load(f)

    tz_bjs = timezone(timedelta(hours=8))
    def parse_dt(iso_str):
        if not iso_str: return None
        return datetime.datetime.fromisoformat(iso_str.replace('Z', '+00:00')).astimezone(tz_bjs)

    all_op_dates = {}
    all_op_names = {}
    j15_op_ids = set()
    j15_ops = {}
    
    for op in data.get("operation_demands", []):
        opid = op.get("operation_plan_id")
        dt = parse_dt(op.get("planned_start"))
        if dt:
            dstr = dt.strftime("%Y-%m-%d")
            all_op_dates[opid] = dstr
            if dstr == "2026-07-15":
                j15_op_ids.add(opid)
                j15_ops[opid] = op
        all_op_names[opid] = op.get("operation_name")
        
    sgroups = data.get("shared_preferences", [])
    
    print("\n========= Comprehensive Share Group Tracing for 07-15 operations ========")
    for sg in sgroups:
        member_ids = [m.get("operation_plan_id") for m in sg.get("members", [])]
        overlap = j15_op_ids.intersection(set(member_ids))
        
        if overlap:
            print(f"Share Group: {sg.get('share_group_name')} [Mode: {sg.get('share_mode')}]")
            for mop in set(member_ids):
                date = all_op_dates.get(mop, "Unknown")
                name = all_op_names.get(mop, "Unknown")
                mark = "*** TRAGET(07-15) ***" if mop in overlap else ""
                print(f"   --> {date} | {name} | OP_ID: {mop} {mark}")
            print("-" * 50)
            
if __name__ == "__main__":
    analyze()
