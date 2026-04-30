"""
MFG8APS Database Migration Script
Exports from local MySQL and imports to Zeabur MySQL.
Uses Python mysql.connector to avoid MySQL client version incompatibilities.
"""

import mysql.connector
import sys
import os

# ━━━ Configuration ━━━
LOCAL_CONFIG = {
    'host': '127.0.0.1',
    'port': 3306,
    'user': 'root',
    'password': '',
    'database': 'aps_system',
    'charset': 'utf8mb4',
    'use_pure': True,
}

REMOTE_CONFIG = {
    'host': '43.128.242.45',
    'port': 32582,
    'user': 'root',
    'password': '2e5LdS9B0w1xhqmW6783HOaTrDAjy4kc',
    'database': 'aps_system',
    'charset': 'utf8mb4',
    'use_pure': True,
    'allow_local_infile': True,
}

DUMP_FILE = os.path.expanduser('~/Desktop/aps_system_dump.sql')


def dump_local_db():
    """Use mysqldump to export local database to SQL file."""
    print("━━━ Step 1: Dumping local database ━━━")
    
    # mysqldump from local should work fine for local-to-local
    cmd = (
        f'export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH" && '
        f'mysqldump -u root --no-tablespaces '
        f'--single-transaction '
        f'--routines '
        f'--triggers '
        f'--skip-column-statistics '
        f'--default-auth=caching_sha2_password '
        f'aps_system > "{DUMP_FILE}"'
    )
    
    ret = os.system(cmd)
    if ret != 0:
        print(f"ERROR: mysqldump failed with exit code {ret}")
        sys.exit(1)
    
    size = os.path.getsize(DUMP_FILE)
    print(f"✅ Dump complete: {DUMP_FILE} ({size / 1024 / 1024:.1f} MB)")
    return DUMP_FILE


def import_to_remote(dump_file):
    """Import SQL dump into Zeabur MySQL using Python."""
    print("\n━━━ Step 2: Importing to Zeabur MySQL ━━━")
    
    with open(dump_file, 'r', encoding='utf-8') as f:
        sql_content = f.read()
    
    print(f"  SQL file size: {len(sql_content) / 1024 / 1024:.1f} MB")
    
    conn = mysql.connector.connect(**REMOTE_CONFIG)
    cursor = conn.cursor()
    
    # Disable FK checks during import
    cursor.execute("SET FOREIGN_KEY_CHECKS=0")
    cursor.execute("SET SQL_MODE='NO_AUTO_VALUE_ON_ZERO'")
    cursor.execute("SET NAMES utf8mb4")
    
    # Split by statements while respecting delimiters
    # For complex dumps, we need to handle DELIMITER changes
    statements = []
    current_stmt = []
    delimiter = ';'
    
    for line in sql_content.split('\n'):
        stripped = line.strip()
        
        # Skip comments and empty lines
        if stripped.startswith('--') or stripped.startswith('/*') or stripped == '':
            continue
        
        # Handle DELIMITER changes
        if stripped.upper().startswith('DELIMITER'):
            parts = stripped.split()
            if len(parts) >= 2:
                delimiter = parts[1]
            continue
        
        current_stmt.append(line)
        joined = '\n'.join(current_stmt).strip()
        
        if joined.endswith(delimiter):
            # Remove the delimiter from end
            if delimiter != ';':
                stmt = joined[:-len(delimiter)].strip()
            else:
                stmt = joined[:-1].strip()
            
            if stmt:
                statements.append(stmt)
            current_stmt = []
    
    # Execute remaining
    if current_stmt:
        stmt = '\n'.join(current_stmt).strip().rstrip(delimiter).strip()
        if stmt:
            statements.append(stmt)
    
    print(f"  Total statements to execute: {len(statements)}")
    
    success = 0
    errors = 0
    error_samples = []
    
    for i, stmt in enumerate(statements):
        try:
            cursor.execute(stmt)
            conn.commit()
            success += 1
        except mysql.connector.Error as e:
            errors += 1
            if len(error_samples) < 5:
                short_stmt = stmt[:80].replace('\n', ' ')
                error_samples.append(f"  [{i}] {e.msg[:60]} | SQL: {short_stmt}...")
        
        if (i + 1) % 100 == 0:
            print(f"  Progress: {i+1}/{len(statements)} ({success} ok, {errors} err)")
    
    cursor.execute("SET FOREIGN_KEY_CHECKS=1")
    conn.commit()
    
    # Verify tables
    cursor.execute("SHOW TABLES")
    tables = [row[0] for row in cursor.fetchall()]
    
    cursor.close()
    conn.close()
    
    print(f"\n✅ Import complete: {success} statements succeeded, {errors} errors")
    print(f"✅ Tables in remote aps_system: {len(tables)}")
    for t in sorted(tables):
        print(f"   - {t}")
    
    if error_samples:
        print(f"\n⚠️  Sample errors (first {len(error_samples)}):")
        for e in error_samples:
            print(e)


if __name__ == '__main__':
    dump_file = dump_local_db()
    import_to_remote(dump_file)
    print("\n🎉 Database migration complete!")
