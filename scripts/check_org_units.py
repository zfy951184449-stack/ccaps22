import pymysql
import json
import datetime

DB_CONFIG = {
    'host': 'localhost',
    'user': 'root',
    'password': '',
    'database': 'aps_system',
    'charset': 'utf8mb4',
    'cursorclass': pymysql.cursors.DictCursor
}

def default_converter(o):
    if isinstance(o, datetime.datetime):
        return o.__str__()
    if isinstance(o, datetime.date):
        return o.__str__()

def main():
    conn = pymysql.connect(**DB_CONFIG)
    try:
        with conn.cursor() as cursor:
            print("Querying organization_units for ID 3...")
            cursor.execute("SELECT * FROM organization_units WHERE id = 3")
            unit = cursor.fetchone()
            if unit:
                print("Found in organization_units:")
                print(json.dumps(unit, indent=2, ensure_ascii=False, default=default_converter))
            else:
                print("ID 3 not found in 'organization_units' table.")
            
            print("\nQuerying teams for ID 3 (verification)...")
            cursor.execute("SELECT * FROM teams WHERE id = 3")
            team = cursor.fetchone()
            if team:
                print("Found in teams:")
                print(json.dumps(team, indent=2, ensure_ascii=False, default=default_converter))

    finally:
        conn.close()

if __name__ == "__main__":
    main()
