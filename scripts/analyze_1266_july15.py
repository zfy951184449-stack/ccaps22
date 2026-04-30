import json
from collections import defaultdict
import datetime
from datetime import timezone, timedelta

def analyze():
    request_file = "/Users/zhengfengyi/MFG8APS/solver_v4/logs/request_1266.json"
    with open(request_file, 'r', encoding='utf-8') as f:
        data = json.load(f)

    ops = data.get("operation_demands", [])
    emps = data.get("employee_profiles", [])
    sgroups = data.get("shared_preferences", [])
    
    # helper for tz
    tz_bjs = timezone(timedelta(hours=8))
    
    def parse_dt(iso_str):
        if not iso_str: return None
        # naive parse
        # e.g. 2026-07-01T06:30:00.000Z
        dt_str = iso_str.replace('Z', '+00:00')
        dt = datetime.datetime.fromisoformat(dt_str)
        # convert to BJS
        return dt.astimezone(tz_bjs)

    target_date = "2026-07-15"
    
    july15_ops = []
    
    for op in ops:
        dt = parse_dt(op.get("planned_start"))
        if dt and dt.strftime("%Y-%m-%d") == target_date:
            july15_ops.append(op)
            
    print(f"\n======== Ops on {target_date} (Local Time) ========")
    print(f"Total Ops: {len(july15_ops)}")
    for op in july15_ops:
        st = parse_dt(op.get("planned_start"))
        ed = parse_dt(op.get("planned_end"))
        print(f"  ID:{op['operation_id']} | Start:{st.strftime('%H:%M')} | End:{ed.strftime('%H:%M')} | Name: {op['operation_name']}")

    # Analyze total demand on July 15 and previous days
    daily_demand = defaultdict(int)
    for op in ops:
        dt = parse_dt(op.get("planned_start"))
        if dt:
            dstr = dt.strftime("%Y-%m-%d")
            for pos in op.get("position_qualifications", []):
                daily_demand[dstr] += 1
                
    print("\n======= Demand over nearby days ========")
    target_date_dt = datetime.datetime.strptime(target_date, "%Y-%m-%d")
    for delta in range(-6, 2):
        dstr = (target_date_dt + timedelta(days=delta)).strftime("%Y-%m-%d")
        print(f"  {dstr}: {daily_demand[dstr]} positions required")

    print("\n======= Checking Share Group Links for 07-15 ========")
    j15_op_ids = {op['operation_id'] for op in july15_ops}
    linked_sg = []
    for sg in sgroups:
        groups = sg.get("sub_groups", [])
        sg_ops = set()
        for g in groups:
            sg_ops.update(g.get("operations", []))
        if sg_ops.intersection(j15_op_ids):
            is_same_person = sg.get("is_same_person", False)
            cross_days = False
            # Check if this share group crosses multiple days
            sg_dates = set()
            for oid in sg_ops:
                # find that op
                for o in ops:
                    if o['operation_id'] == oid:
                        odt = parse_dt(o.get('planned_start'))
                        if odt:
                            sg_dates.add(odt.strftime("%Y-%m-%d"))
                        break
            linked_sg.append((sg.get("name"), is_same_person, sg_dates))
            
    for sg in linked_sg:
        print(f"  Share Group: {sg[0]} | Same Person: {sg[1]} | Dates Span: {sorted(list(sg[2]))}")
        
    print("\n======= Availability Checking on 07-15 ========")
    unavail = 0
    for emp in emps:
        is_u = False
        for p in emp.get("unavailable_periods", []):
            ust = parse_dt(p.get("start"))
            ued = parse_dt(p.get("end"))
            if ust and ued:
                # check if overlaps with target_date
                t_st = target_date_dt.replace(tzinfo=tz_bjs)
                t_ed = t_st + timedelta(days=1)
                # overlap logic
                if ust < t_ed and ued > t_st:
                    is_u = True
        if is_u:
            unavail += 1
    print(f"Unavailable Emps on 07-15 explicitly: {unavail} / {len(emps)}")

if __name__ == "__main__":
    analyze()
