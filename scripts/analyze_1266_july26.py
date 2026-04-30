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

    target_date = "2026-07-26"
    ops = data.get("operation_demands", [])
    sgroups = data.get("shared_preferences", [])
    
    j26_ops = []
    
    for op in ops:
        dt = parse_dt(op.get("planned_start"))
        if dt and dt.strftime("%Y-%m-%d") == target_date:
            j26_ops.append(op)
            
    # Share Group extraction
    # map opid -> list of share groups it belongs to
    op_to_groups = {}
    for sg in sgroups:
        sg_id = sg.get("share_group_id")
        sg_name = sg.get("share_group_name")
        for m in sg.get("members", []):
            opid = m.get("operation_plan_id")
            if opid not in op_to_groups:
                op_to_groups[opid] = []
            op_to_groups[opid].append({"id": sg_id, "name": sg_name})

    print(f"\n======== Ops on {target_date} ========")
    total_ppl = 0
    for op in sorted(j26_ops, key=lambda x: parse_dt(x.get("planned_start"))):
        opid = op.get("operation_plan_id")
        st = parse_dt(op.get("planned_start")).strftime("%H:%M")
        ed = parse_dt(op.get("planned_end")).strftime("%H:%M")
        req_ppl = sum(1 for _ in op.get("position_qualifications", []))
        total_ppl += req_ppl
        
        sg_info = ""
        if opid in op_to_groups:
            sg_info = " | " + " & ".join([str(g["id"]) for g in op_to_groups[opid]])
            
        print(f"[{st}-{ed}] {op['operation_name']} (ID:{opid}) | Ppl:{req_ppl}{sg_info}")

    print(f"\nTotal Individual Position Slots required on {target_date}: {total_ppl}")

    # Check for Buggy Overlaps specifically on 26th
    print("\n======== Detecting SAME_TEAM overlapping bug ========")
    # 1. build cliques (overlapping ops)
    events = []
    for op in j26_ops:
        opid = op.get("operation_plan_id")
        start = parse_dt(op.get("planned_start")).timestamp()
        end = parse_dt(op.get("planned_end")).timestamp()
        events.append((start, 1, opid))
        events.append((end, -1, opid))
    
    events.sort(key=lambda x: (x[0], x[1]))
    current_active = set()
    raw_cliques = []
    for t, type_, opid in events:
        if type_ == 1:
            current_active.add(opid)
            if len(current_active) > 1:
                raw_cliques.append(frozenset(current_active))
        else:
            current_active.discard(opid)
            
    # Find overlapping ops that are supposed to be in SAME_TEAM but have different last-assigned SG_IDs
    # We simulate exactly how the bug worked:
    fake_dict = {}
    for sg in sgroups:
        for m in sg.get("members", []):
            fake_dict[m.get("operation_plan_id")] = sg.get("share_group_id")

    found_bug = False
    for clique in set(raw_cliques):
        # pair up
        ops_list = list(clique)
        for i in range(len(ops_list)):
            for j in range(i+1, len(ops_list)):
                o1 = ops_list[i]
                o2 = ops_list[j]
                
                # are they logically connected via share group graph?
                # we can do a simple check: if o1 and o2 have multiple groups, they might be connected
                # Let's just check if their fake_dict Group ID is DIFFERENT but they share any overarching connection
                id1 = fake_dict.get(o1)
                id2 = fake_dict.get(o2)
                
                if id1 and id2 and id1 != id2:
                    # check if they're indirectly connected
                    g1_list = [g["id"] for g in op_to_groups.get(o1, [])]
                    g2_list = [g["id"] for g in op_to_groups.get(o2, [])]
                    
                    # They share a common group but the last assigned is different? No, maybe connected across multiple groups A-B-C.
                    # As a proxy, if they belong to ANY shared group logic that binds them...
                    # For simplity, just print any overlap between operations that both belong to some shared group
                    print(f"Overlap detected between Ops in different final group IDs: {o1} (Grp {id1}) vs {o2} (Grp {id2})")
                    found_bug = True
                    
    if not found_bug:
        print("No apparent overlapping bug groups found.")

if __name__ == "__main__":
    analyze()
