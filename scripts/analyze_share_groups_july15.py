import json
import datetime
from datetime import timezone, timedelta
from collections import defaultdict

def analyze():
    request_file = "/Users/zhengfengyi/MFG8APS/solver_v4/logs/request_1266.json"
    with open(request_file, 'r', encoding='utf-8') as f:
        data = json.load(f)

    tz_bjs = timezone(timedelta(hours=8))
    def parse_dt(iso_str):
        if not iso_str: return None
        return datetime.datetime.fromisoformat(iso_str.replace('Z', '+00:00')).astimezone(tz_bjs)

    ops = data.get("operation_demands", [])
    sgroups = data.get("shared_preferences", [])
    target_date = "2026-07-15"
    
    # 1. 找到 07-15 所有的 op 和它们的 operation_plan_id
    j15_ops = {} # map operation_plan_id to op object
    for op in ops:
        dt = parse_dt(op.get("planned_start"))
        if dt and dt.strftime("%Y-%m-%d") == target_date:
            j15_ops[op.get("operation_plan_id")] = op

    print(f"\n======== Ops on {target_date} ========")
    for opid, op in j15_ops.items():
        print(f"PlanID: {opid} | Name: {op['operation_name']}")
        
    # 构建 members 对应的日期映射
    all_op_dates = {}
    all_op_names = {}
    for op in ops:
        opid = op.get("operation_plan_id")
        dt = parse_dt(op.get("planned_start"))
        if dt:
            all_op_dates[opid] = dt.strftime("%Y-%m-%d")
        all_op_names[opid] = op.get("operation_name")
        
    print("\n======= Share Groups linked to 07-15 ========")
    j15_op_ids = set(j15_ops.keys())
    
    for sg in sgroups:
        members = sg.get("members", [])
        member_opids = [m.get("operation_plan_id") for m in members]
        overlap = set(member_opids).intersection(j15_op_ids)
        
        if overlap:
            print(f"  [Group] {sg.get('share_group_name')} | Mode: {sg.get('share_mode')}")
            # 查一下这个 group 里所有 member的日期
            for mop in member_opids:
                if mop in all_op_dates:
                    mark = "*** 07-15 ***" if mop in j15_op_ids else "Other day"
                    print(f"     => PlanID: {mop} | Date: {all_op_dates[mop]} | Name: {all_op_names.get(mop)} ({mark})")
            print("  -----------------------------------")
            
if __name__ == "__main__":
    analyze()
