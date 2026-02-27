import pymysql
import sys

# Configuration
DB_CONFIG = {
    'host': 'localhost',
    'user': 'root',
    'password': '',
    'database': 'aps_system',
    'charset': 'utf8mb4'
}

DSP_TEAM_ID = 4 # From previous check
MFG8_DEPT = 'MFG8'

# Data Structure: (Shift Leader Name, [Members...])
# Pinyin manually approximated for codes
TEAMS = [
    ("韩英坤", "HanYingkun", ["郑新哲", "夏天", "徐嘉诚"]),
    ("李云峰", "LiYunfeng", ["甄晓黛", "李进"]),
    ("单继元", "ShanJiyuan", ["王超颖", "杨剑章", "邹成龙"]),
    ("张展展", "ZhangZhanzhan", ["赵玉颖", "李雪达", "刘佳庆", "孙志轩"]),
    ("李善献", "LiShanxian", ["苏红坤", "李尚明", "倪杰", "李帅敏"]),
    ("卢晓霞", "LuXiaoxia", ["王进", "周琦", "张克俭", "李昊泽"]),
    ("韩洋洲", "HanYangzhou", ["席天峰", "刘博维", "白云飞"]),
    ("张志兴", "ZhangZhixing", ["朱永康", "赵跃", "张梦双"])
]

# Helper for pinyin generation (simplified, just for uniqueness if needed, but we used manual codes for leaders)
# For members, we will generate a simple code prefix + index or something, 
# BUT user asked to "Identify" them. I will use a simple pinyin-like map or just simple numbering if pinyin is hard.
# To be safe and professional, let's try to make nice codes.
# Since I don't have pinyin lib, I'll use DSP_USER_{Index} for members to avoid encoding issues or guessing errors,
# unless I make a quick map. Let's use DSP_{Name} if possible, but without pinyin lib it's hard.
# Actually, I will just use `DSP_MEMBER_{GlobalIndex}` for members to be safe, and update names correctly.
# Wait, user *asked* about pinyin in notify_user but didn't confirm. I asked "Pinyin?" and they just said "role 为Frontline".
# So I will use a safe convention: DSP_{Row}_{Index}.

def connect_db():
    return pymysql.connect(**DB_CONFIG)

def main():
    conn = connect_db()
    cursor = conn.cursor()
    
    global_member_idx = 1
    
    try:
        for row_idx, (leader_name, leader_code, members) in enumerate(TEAMS, 1):
            print(f"Processing Group {row_idx}: Leader {leader_name}")
            
            # 1. Insert/Update Leader
            # Position: Shift Leader (implied), OrgRole: SHIFT_LEADER
            sql_leader = """
                INSERT INTO employees (employee_code, employee_name, department, position, org_role)
                VALUES (%s, %s, %s, 'Shift Leader', 'SHIFT_LEADER')
                ON DUPLICATE KEY UPDATE 
                    department=VALUES(department), 
                    position=VALUES(position), 
                    org_role=VALUES(org_role);
            """
            cursor.execute(sql_leader, (leader_code, leader_name, MFG8_DEPT))
            
            # Get Leader ID
            cursor.execute("SELECT id FROM employees WHERE employee_code=%s", (leader_code,))
            leader_id = cursor.fetchone()[0]
            
            # 2. Process Members
            for member_name in members:
                # Generate Code: DSP_M_{GlobalIndex}
                # To make it slightly nicer, maybe just DSP_{GlobalIndex:03d}
                member_code = f"DSP_{global_member_idx:03d}"
                global_member_idx += 1
                
                # Position: Frontline (per user request)
                # OrgRole: FRONTLINE
                sql_member = """
                    INSERT INTO employees (employee_code, employee_name, department, position, org_role)
                    VALUES (%s, %s, %s, 'Frontline', 'FRONTLINE')
                    ON DUPLICATE KEY UPDATE 
                        department=VALUES(department), 
                        position=VALUES(position), 
                        org_role=VALUES(org_role);
                """
                cursor.execute(sql_member, (member_code, member_name, MFG8_DEPT))
                
                # Get Member ID
                cursor.execute("SELECT id FROM employees WHERE employee_code=%s", (member_code,))
                member_id = cursor.fetchone()[0]
                
                # 3. Create Reporting Relation
                # Leader -> Member
                sql_relation = """
                    INSERT IGNORE INTO employee_reporting_relations (leader_id, subordinate_id)
                    VALUES (%s, %s);
                """
                cursor.execute(sql_relation, (leader_id, member_id))
                
        conn.commit()
        print("Successfully imported all personnel and hierarchies.")
        
    except Exception as e:
        conn.rollback()
        print(f"Error: {e}")
        sys.exit(1)
    finally:
        conn.close()

if __name__ == "__main__":
    main()
