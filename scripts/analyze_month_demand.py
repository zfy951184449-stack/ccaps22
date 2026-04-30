import json
import datetime
from datetime import timezone, timedelta
from collections import defaultdict

def analyze():
    request_file = "/Users/zhengfengyi/MFG8APS/solver_v4/logs/request_1266.json"
    with open(request_file, 'r', encoding='utf-8') as f:
        data = json.load(f)

    ops = data.get("operation_demands", [])
    tz_bjs = timezone(timedelta(hours=8))
    
    def parse_dt(iso_str):
        if not iso_str: return None
        dt_str = iso_str.replace('Z', '+00:00')
        dt = datetime.datetime.fromisoformat(dt_str)
        return dt.astimezone(tz_bjs)

    daily_demand = defaultdict(int)
    for op in ops:
        dt = parse_dt(op.get("planned_start"))
        if dt:
            dstr = dt.strftime("%Y-%m-%d")
            for pos in op.get("position_qualifications", []):
                daily_demand[dstr] += 1
                
    print("\n======= Demand over the entire month (Local Time) ========")
    for dstr in sorted(daily_demand.keys()):
        print(f"  {dstr}: {daily_demand[dstr]:02d} positions required")

if __name__ == "__main__":
    analyze()
