import mysql.connector
import os
import json
from datetime import datetime

def get_db_connection():
    return mysql.connector.connect(
        host=os.getenv('DB_HOST', 'localhost'),
        user=os.getenv('DB_USER', 'root'),
        password=os.getenv('DB_PASSWORD', 'password'), # Replace with actual if known or use env
        database=os.getenv('DB_NAME', 'ccaps22')
    )

def find_long_shifts():
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        
        # Query for shifts with plan_hours >= 24 or actual assignments summing to >= 24
        query = """
            SELECT 
                esp.id,
                esp.employee_id,
                e.employee_name,
                esp.plan_date,
                esp.plan_hours,
                esp.shift_nominal_hours,
                esp.shift_id,
                sd.shift_code,
                sd.shift_name
            FROM employee_shift_plans esp
            JOIN employees e ON esp.employee_id = e.id
            LEFT JOIN shift_definitions sd ON esp.shift_id = sd.id
            WHERE esp.plan_hours >= 24
               OR esp.shift_nominal_hours >= 24
            ORDER BY esp.plan_date DESC
            LIMIT 10;
        """
        
        cursor.execute(query)
        rows = cursor.fetchall()
        
        print(f"Found {len(rows)} suspicious shifts:")
        for row in rows:
            print(json.dumps(row, default=str, indent=2, ensure_ascii=False))
            
    except Exception as e:
        print(f"Error: {e}")
    finally:
        if 'conn' in locals() and conn.is_connected():
            cursor.close()
            conn.close()

if __name__ == "__main__":
    find_long_shifts()
