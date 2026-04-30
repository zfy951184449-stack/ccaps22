import json

def get_shift_metrics(shift_type):
    if shift_type == "DAY":
        return 8.5, 21.0, 11.0
    else:  # NIGHT
        return 20.5, 9.0, 11.0

# 预设基于真实排盘网格提取的每日/排班人数上限 (精准映射表)
SHIFT_PEOPLE_MAP = {
    (0, "DAY"): 2,
    (1, "DAY"): 5, (1, "NIGHT"): 2,
    (2, "DAY"): 3, (2, "NIGHT"): 1,
    (3, "DAY"): 4, (3, "NIGHT"): 1,
    (4, "DAY"): 4, (4, "NIGHT"): 1,
    (5, "DAY"): 4, (5, "NIGHT"): 1,
    (6, "DAY"): 4, (6, "NIGHT"): 1,
    (7, "DAY"): 4, (7, "NIGHT"): 0, 
    (8, "DAY"): 4, (8, "NIGHT"): 1,
    (9, "DAY"): 4, (9, "NIGHT"): 1,
    (10, "DAY"): 3, (10, "NIGHT"): 0,
    (11, "DAY"): 5, (11, "NIGHT"): 1,
    (12, "DAY"): 3, (12, "NIGHT"): 2
}

def generate_full_json():
    template = {
        "template": {
            "template_code": "WBP2486_DSP",
            "template_name": "Full_Excel_Mapped_DSP工艺",
            "description": "按天防重命名 + 班次并集共享防并发 + DSPALL资质设定",
            "total_days": 13
        },
        "stages": [
            {"stage_code": "STG_AC", "stage_name": "AC", "stage_order": 1, "start_day": 0},
            {"stage_code": "STG_VIN", "stage_name": "VIN", "stage_order": 2, "start_day": 1},
            {"stage_code": "STG_CEX", "stage_name": "CEX", "stage_order": 3, "start_day": 2},
            {"stage_code": "STG_UFDF1", "stage_name": "UFDF1", "stage_order": 4, "start_day": 3},
            {"stage_code": "STG_AEX", "stage_name": "AEX", "stage_order": 5, "start_day": 4},
            {"stage_code": "STG_HA", "stage_name": "HA", "stage_order": 6, "start_day": 6},
            {"stage_code": "STG_VF", "stage_name": "VF", "stage_order": 7, "start_day": 8},
            {"stage_code": "STG_UFDF2", "stage_name": "UFDF2", "stage_order": 8, "start_day": 9},
            {"stage_code": "STG_UFDF3", "stage_name": "UFDF3", "stage_order": 9, "start_day": 10},
            {"stage_code": "STG_BULK", "stage_name": "Bulk Fill", "stage_order": 10, "start_day": 10},
            {"stage_code": "STG_CIP_WFI", "stage_name": "CIP_WFI_Section", "stage_order": 11, "start_day": 0}
        ],
        "share_groups": [],
        "operations": {
            k["stage_code"]: [] for k in [
                {"stage_code": "STG_AC"}, {"stage_code": "STG_VIN"}, {"stage_code": "STG_CEX"},
                {"stage_code": "STG_UFDF1"}, {"stage_code": "STG_AEX"}, {"stage_code": "STG_HA"},
                {"stage_code": "STG_VF"}, {"stage_code": "STG_UFDF2"}, {"stage_code": "STG_UFDF3"},
                {"stage_code": "STG_BULK"}, {"stage_code": "STG_CIP_WFI"}
            ]
        },
        "constraints": []
    }

    op_counter = 1
    shift_bins = {} # To collect all operations sharing the same Day + Shift
    stage_name_map = {s["stage_code"]: s["stage_name"] for s in template["stages"]}

    def push_op(stage_key, equip, action, day, shift):
        nonlocal op_counter
        # 根据 Day / Shift 获取配置人数，兜底为 4 
        req_people = SHIFT_PEOPLE_MAP.get((day, shift), 4)
        
        sanitized_equip = str(equip).replace(" ", "_").replace("/", "_").replace(".", "_")
        sanitized_action = str(action).replace(" ", "_").replace("/", "_").replace(".", "_")
        
        op_name = f"D{day}_{sanitized_equip}_{sanitized_action}"
        
        w_start, w_end, st = 8.0, 20.0, 12.0
        if shift == "DAY":
            w_start, w_end, st = 8.0, 20.0, 12.0
        else:  # NIGHT
            w_start, w_end, st = 20.5, 9.0, 11.0
            
        op_data = {
            "operation_code": f"OP_{op_counter}_{day}",
            "operation_name": op_name,
            "operation_day": day,
            "standard_time": st,
            "recommended_time": w_start,
            "window_start_time": w_start,
            "window_end_time": w_end,
            "operation_order": op_counter * 10,
            "required_people": req_people,
            "qualifications": ["DSPALL"]  # Explicit requirement 
        }
        template["operations"][stage_key].append(op_data)
        op_counter += 1

        # Collect for Share Groups
        bin_key = f"Day{day}_{shift}"
        if bin_key not in shift_bins:
            shift_bins[bin_key] = {"max_people": req_people, "members": []}
        
        shift_bins[bin_key]["members"].append({
            "operation_name": op_name,
            "required_people": req_people, 
            "stage_name": stage_name_map[stage_key]
        })

    def batch_generate(stage_key, eq_list, days_shifts_actions):
        """
        days_shifts_actions: [{day: 1, shift: 'DAY', action: 'AC C1'}, ...]
        """
        for eq in eq_list:
            for item in days_shifts_actions:
                push_op(stage_key, eq, item['action'], item['day'], item['shift'])

    # Building block definitions (Same matrices as before)
    # AC Stage
    push_op("STG_AC", "Room", "Material_Prep", 0, "DAY")
    push_op("STG_AC", "2_AKTA_1850", "CIP", 0, "DAY")
    push_op("STG_AC", "logbook", "Checks", 1, "DAY")
    ac_core = ["T1810", "U1850_In", "U1850_Out", "U1850_POUA_BH1720", "U1850_POUA_BH1731", "U1850_POUB_BH1740", "U1850_POUB_BH1741", "B01", "B23"]
    batch_generate("STG_AC", ac_core, [
        {"day": 1, "shift": "DAY", "action": "AC_Prep"},
        {"day": 1, "shift": "NIGHT", "action": "AC_C1"},
        {"day": 2, "shift": "DAY", "action": "AC_C2_C3"},
        {"day": 2, "shift": "NIGHT", "action": "AC_C2_C3_part2"},
        {"day": 3, "shift": "DAY", "action": "AC_C4"},
        {"day": 3, "shift": "NIGHT", "action": "CIP_Discard"}
    ])
    batch_generate("STG_AC", ["2_AKTA_1850", "Col_1.2m"], [
        {"day": 1, "shift": "DAY", "action": "AC_EQ"}, {"day": 1, "shift": "NIGHT", "action": "AC_C1_C2"},
        {"day": 2, "shift": "DAY", "action": "AC_C2_C3"}, {"day": 2, "shift": "NIGHT", "action": "AC_C2_C3"},
        {"day": 3, "shift": "DAY", "action": "AC_C4"}, {"day": 4, "shift": "DAY", "action": "CIP"}
    ])
    
    # VIN
    batch_generate("STG_VIN", ["T1812", "B06", "B07", "TransferLine_T1810"], [
        {"day": 1, "shift": "NIGHT", "action": "VIN_C1"}, {"day": 2, "shift": "DAY", "action": "VIN_C2_C3"},
        {"day": 2, "shift": "NIGHT", "action": "VIN_C2_C3"}, {"day": 3, "shift": "DAY", "action": "VIN_C4"},
        {"day": 3, "shift": "NIGHT", "action": "Keep_CIP"}
    ])
    # CEX
    push_op("STG_CEX", "2_AKTA_1851", "CIP", 2, "NIGHT")
    batch_generate("STG_CEX", ["T1813", "T1814", "T1815", "U1851_In", "U1851_Out", "BH1726", "BH1722", "B09"], [
        {"day": 3, "shift": "DAY", "action": "CEX_Prep"}, {"day": 3, "shift": "NIGHT", "action": "CEX_EQ"}, {"day": 4, "shift": "DAY", "action": "CEX_C1"}
    ])
    # UFDF
    batch_generate("STG_UFDF1", ["U1853", "BH1720", "30m2_UFDF"], [
        {"day": 4, "shift": "DAY", "action": "UFDF1_EQ"}, {"day": 4, "shift": "NIGHT", "action": "UFDF1_Proc"}
    ])
    # AEX
    batch_generate("STG_AEX", ["U1852_POUA", "B05", "1.5_AKTA"], [
        {"day": 5, "shift": "DAY", "action": "AEX_C1"}, {"day": 5, "shift": "NIGHT", "action": "AEX_C2"}, {"day": 6, "shift": "DAY", "action": "CIP"}
    ])
    # HA
    batch_generate("STG_HA", ["U1852_POUB", "1.5_AKTA"], [
        {"day": 7, "shift": "DAY", "action": "HA"}, {"day": 7, "shift": "NIGHT", "action": "HA_Proc"}, {"day": 8, "shift": "DAY", "action": "HA_Proc2"}
    ])
    # VF, UFDF2/3, Bulk
    push_op("STG_VF", "VF_Skid", "Process", 8, "NIGHT")
    push_op("STG_UFDF2", "15m2", "EQ", 9, "DAY")
    push_op("STG_UFDF2", "15m2", "Process", 9, "NIGHT")
    push_op("STG_UFDF3", "1m2", "EQ", 10, "DAY")
    batch_generate("STG_BULK", ["Bulk Fill"], [{"day":11, "shift":"DAY", "action":"Main"}, {"day":11, "shift":"NIGHT", "action":"Freeze"}])
    batch_generate("STG_CIP_WFI", ["CIP1890", "PT1810"], [{"day":4, "shift":"DAY", "action":"CIP"}, {"day":12, "shift":"DAY", "action":"SIP"}])

    # === Compile Share Groups dynamically generated based on Bin Keys ===
    grp_id = 1
    for bin_key, bin_data in shift_bins.items():
        max_p = bin_data["max_people"]
        template["share_groups"].append({
            "group_code": f"GRP_{bin_key}",
            "group_name": f"{bin_key} 同班同源共享组_防并发锁定",
            "share_mode": "SAME_TEAM",
            "description": f"接管 {bin_key} 所有任务,封顶消耗人数: {max_p}",
            "members": bin_data["members"]
        })
        grp_id += 1

    with open("/Users/zhengfengyi/MFG8APS/database/wbp2486_excel_mapped_sample.json", "w", encoding="utf-8") as f:
        json.dump(template, f, ensure_ascii=False, indent=2)

if __name__ == "__main__":
    generate_full_json()
