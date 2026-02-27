import os
import re
import json
from datetime import datetime

# Configuration
PROJECT_ROOT = '/Users/zhengfengyi/MFG8APS'
SQL_DIR = os.path.join(PROJECT_ROOT, 'database')
ROUTES_DIR = os.path.join(PROJECT_ROOT, 'backend/src/routes')
BACKEND_SRC = os.path.join(PROJECT_ROOT, 'backend/src')
FRONTEND_SRC = os.path.join(PROJECT_ROOT, 'frontend/src')

OUTPUT_HTML = os.path.join(PROJECT_ROOT, 'docs/database_api_dictionary.html')

# Categories Definition with Translations
CATEGORY_MAP = {
    'Personnel & Organization': '人员与组织架构 (Personnel & Org)',
    'Qualifications': '资质与能力管理 (Qualifications)',
    'Process Templates': '工艺模版与操作 (Process Templates)',
    'Batch Planning': '生产批次计划 (Batch Planning)',
    'Scheduling Core': '排班核心业务 (Scheduling Core)',
    'Calendar & Holidays': '日历与节假日 (Calendar & Holidays)',
    'System & Metrics': '系统配置与指标 (System & Metrics)'
}

TABLE_CATEGORIES = {
    'Personnel & Organization': [
        'employees', 'departments', 'teams', 'shifts', 'organization_units',
        'employee_roles', 'employee_reporting_relations', 'employee_team_roles',
        'employee_unavailability'
    ],
    'Qualifications': [
        'qualifications', 'employee_qualifications', 'operation_qualification_requirements'
    ],
    'Process Templates': [
        'operations', 'process_templates', 'process_stages', 'stage_operation_schedules',
        'operation_constraints', 'personnel_share_groups', 'operation_share_group_relations'
    ],
    'Batch Planning': [
        'production_batch_plans', 'batch_operation_plans', 'batch_personnel_assignments',
        'batch_operation_constraints'
    ],
    'Scheduling Core': [
        'personnel_schedules', 'shift_types', 'shift_definitions', 'scheduling_rules',
        'scheduling_conflicts', 'employee_shift_plans', 'employee_schedule_history',
        'employee_shift_preferences', 'employee_shift_limits'
    ],
    'Calendar & Holidays': [
        'calendar_workdays', 'national_holidays', 'holiday_salary_config',
        'holiday_salary_rules', 'holiday_update_log', 'quarterly_standard_hours'
    ],
    'System & Metrics': [
        'system_settings', 'schedule_change_log', 'shift_change_logs',
        'scheduling_metrics_snapshots', 'scheduling_metric_thresholds',
        'constraint_validation_cache', 'overtime_records'
    ]
}

# Type Translations
TYPE_TRANSLATIONS = {
    'INT': '整数',
    'TINYINT': '微整数/布尔',
    'BIGINT': '长整数',
    'DECIMAL': '精确小数',
    'FLOAT': '浮点数',
    'DOUBLE': '双精度浮点',
    'VARCHAR': '变长字符串',
    'CHAR': '定长字符串',
    'TEXT': '长文本',
    'LONGTEXT': '超长文本',
    'DATE': '日期',
    'TIME': '时间',
    'DATETIME': '日期时间',
    'TIMESTAMP': '时间戳',
    'BOOLEAN': '布尔值',
    'ENUM': '枚举(选项)',
    'JSON': 'JSON对象'
}

# Reverse lookup
TABLE_TO_CATEGORY = {}
for cat, tables in TABLE_CATEGORIES.items():
    for t in tables:
        TABLE_TO_CATEGORY[t] = cat

# Regex
TABLE_PATTERN = re.compile(r'CREATE TABLE\s+(?:IF NOT EXISTS\s+)?(\w+)\s*\((.*?)\)(?=\s*(?:ENGINE|;))', re.DOTALL | re.IGNORECASE)
# Revised Column Pattern: Name, Type (with optional parens), Rest
COLUMN_PATTERN = re.compile(r'^\s*(`?\w+`?)\s+([a-zA-Z0-9]+(?:\([^)]+\))?)\s*(.*)', re.IGNORECASE)
PK_PATTERN = re.compile(r'PRIMARY KEY\s*\((.*?)\)', re.IGNORECASE)
FK_PATTERN = re.compile(r'FOREIGN KEY\s*\((.*?)\)\s*REFERENCES\s+(\w+)\s*\((.*?)\)', re.IGNORECASE)
ROUTE_PATTERN = re.compile(r"router\.(get|post|put|delete|patch)\s*\(\s*['\"]([^'\"]+)['\"]", re.IGNORECASE)

IGNORED_USAGE_CHECK = {'id', 'created_at', 'updated_at', 'created_by', 'updated_by'}

def get_category(table_name):
    return TABLE_TO_CATEGORY.get(table_name, 'Uncategorized')

def translate_type(sql_type):
    # Handle types with length e.g. VARCHAR(50)
    base_type = sql_type.split('(')[0].upper()
    cn = TYPE_TRANSLATIONS.get(base_type, '')
    if cn:
        return f'{sql_type}<br><span style="color:#999;font-size:11px;">{cn}</span>'
    return sql_type

def load_codebase_content():
    content = ""
    dirs = [BACKEND_SRC, FRONTEND_SRC]
    count = 0
    for d in dirs:
        for root, _, files in os.walk(d):
            for f in files:
                if f.endswith(('.ts', '.tsx', '.js', '.py')):
                    try:
                        with open(os.path.join(root, f), 'r', encoding='utf-8', errors='ignore') as fh:
                            content += fh.read() + "\n"
                        count += 1
                    except: pass
    print(f"Scanned {count} files.")
    return content

def check_usage(name, content):
    if name in IGNORED_USAGE_CHECK: return True
    return name in content

def parse_sql_files(codebase_content):
    tables = {}
    files = [f for f in os.listdir(SQL_DIR) if f.endswith('.sql')]
    
    for filename in files:
        filepath = os.path.join(SQL_DIR, filename)
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
            
        matches = TABLE_PATTERN.findall(content)
        for table_name, body in matches:
            columns = []
            pk = None
            fks = []
            
            # FKs
            fk_matches = FK_PATTERN.findall(body)
            for fk_col, ref_table, ref_col in fk_matches:
                fks.append({
                    'column': fk_col.strip('` '),
                    'ref_table': ref_table.strip('` '),
                    'ref_column': ref_col.strip('` ')
                })

            lines = body.split('\n')
            for line in lines:
                line = line.strip()
                # Skip comments or empty lines
                if line.startswith('--') or not line: continue
                # Skip keys defined on their own lines (basic check)
                if line.upper().startswith(('PRIMARY KEY', 'KEY', 'UNIQUE KEY', 'CONSTRAINT', 'INDEX', 'FOREIGN KEY')):
                     # Check for PK definition
                     if 'PRIMARY KEY' in line.upper() and not pk:
                         pk_match = PK_PATTERN.search(line)
                         if pk_match:
                             pk = pk_match.group(1).replace('`', '')
                     continue
                
                # Treat as column definition
                # Remove trailing comma for regex matching
                clean_line = line.rstrip(',')
                col_match = COLUMN_PATTERN.match(clean_line)
                
                if col_match:
                    name = col_match.group(1).strip('`')
                    type_ = col_match.group(2)
                    remainder = col_match.group(3)
                    
                    comment = ""
                    comment_match = re.search(r"COMMENT\s*['\"](.*?)['\"]", remainder, re.IGNORECASE)
                    if comment_match:
                        comment = comment_match.group(1)
                        # Remove comment from attributes
                        attributes = remainder[:comment_match.start()].strip()
                    else:
                        attributes = remainder.strip()
                    
                    # Check for inline PRIMARY KEY definition
                    if 'PRIMARY KEY' in attributes.upper() and not pk:
                        pk = name

                    columns.append({
                        'name': name,
                        'type': type_,
                        'attributes': attributes,
                        'comment': comment,
                        'is_used': check_usage(name, codebase_content)
                    })
            
            tables[table_name] = {
                'columns': columns,
                'primary_key': pk,
                'foreign_keys': fks,
                'source_file': filename,
                'category': get_category(table_name),
                'is_used': check_usage(table_name, codebase_content)
            }
            
    return tables

def parse_routes():
    api_groups = {}
    if not os.path.exists(ROUTES_DIR): return {}

    files = [f for f in os.listdir(ROUTES_DIR) if f.endswith('.ts')]
    for filename in files:
        filepath = os.path.join(ROUTES_DIR, filename)
        group_name = filename.replace('.ts', '')
        routes = []
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
        matches = ROUTE_PATTERN.findall(content)
        for method, path in matches:
            routes.append({'method': method.upper(), 'path': path})
        api_groups[group_name] = routes
    return api_groups

def build_cross_references(tables):
    # Initialize 'referenced_by' for all tables
    for t_name, t_info in tables.items():
        t_info['referenced_by'] = [] # List of {source_table, source_column}

    for t_name, t_info in tables.items():
        for fk in t_info['foreign_keys']:
            target_table = fk['ref_table']
            # local_col = fk['column'] # Not used in identifying target, but needed for payload
            
            if target_table in tables:
                tables[target_table]['referenced_by'].append({
                    'source_table': t_name,
                    'source_column': fk['column'],
                    'target_column': fk['ref_column'] # The column in target table being referenced
                })

def generate_mermaid_diagram(tables):
    mermaid = "erDiagram\n"
    for table_name, info in tables.items():
        for fk in info['foreign_keys']:
            mermaid += f"    {table_name} }}o--|| {fk['ref_table']} : \"{fk['column']}\"\n"
    return mermaid

def generate_html(tables, api_groups):
    tables_by_category = {}
    for t_name, t_info in tables.items():
        cat = t_info['category']
        if cat not in tables_by_category: tables_by_category[cat] = []
        tables_by_category[cat].append(t_name)
        
    defined_cats = list(TABLE_CATEGORIES.keys())
    all_cats = sorted(tables_by_category.keys(), key=lambda x: defined_cats.index(x) if x in defined_cats else 999)

    mermaid_code = generate_mermaid_diagram(tables)

    html = """<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>APS 数据库与 API 字典 (Database Dictionary)</title>
    <!-- Mermaid -->
    <script src="https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/svg-pan-zoom@3.6.1/dist/svg-pan-zoom.min.js"></script>
    <script>
        mermaid.initialize({ startOnLoad: true, theme: 'neutral', securityLevel: 'loose' });
        
        window.addEventListener('load', function() {
            setTimeout(function() {
                const svgElement = document.querySelector(".mermaid svg");
                if(svgElement) {
                    svgElement.style.height = "600px";
                    svgElement.style.width = "100%";
                    svgPanZoom(svgElement, {
                        zoomEnabled: true,
                        controlIconsEnabled: true,
                        fit: true,
                        center: true,
                        minZoom: 0.1,
                        maxZoom: 10
                    });
                }
            }, 500);
        });
    </script>
    <style>
        :root {
            --primary: #007aff;
            --bg: #f5f5f7;
            --card-bg: #fff;
            --text: #1d1d1f;
            --border: #e5e5e5;
            --radius: 12px;
            --unused: #86868b;
            --unused-bg: #f5f5f7;
        }
        body {
            font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            background: var(--bg);
            color: var(--text);
            margin: 0;
            padding: 20px;
            display: flex;
            height: 100vh;
            box-sizing: border-box;
            overflow: hidden;
        }
        aside {
            width: 320px;
            background: var(--card-bg);
            border-radius: var(--radius);
            margin-right: 20px;
            display: flex;
            flex-direction: column;
            box-shadow: 0 4px 12px rgba(0,0,0,0.05);
            overflow: hidden;
            flex-shrink: 0;
        }
        .aside-header {
            padding: 20px;
            border-bottom: 1px solid var(--border);
            background: rgba(255,255,255,0.9);
            backdrop-filter: blur(10px);
        }
        .aside-content {
            overflow-y: auto;
            flex: 1;
            padding: 10px;
        }
        details { margin-bottom: 5px; }
        summary {
            padding: 10px 12px;
            cursor: pointer;
            font-weight: 600;
            font-size: 13px;
            color: #333;
            border-radius: 6px;
            list-style: none; /* Hide default triangle in some browsers */
            display: flex;
            justify-content: space-between;
            align-items: center;
            background: #f9f9fa;
            margin-bottom: 2px;
        }
        summary:hover { background: #f0f0f0; }
        summary::after { content: '›'; transition: transform 0.2s; }
        details[open] summary::after { transform: rotate(90deg); }
        
        .nav-list { list-style: none; padding: 0; margin: 0; margin-top: 5px; }
        .nav-list li a {
            display: flex;
            justify-content: space-between;
            padding: 6px 12px 6px 24px;
            text-decoration: none;
            color: #666;
            font-size: 13px;
            border-radius: 6px;
        }
        .nav-list li a:hover { background: #f5f7fa; color: var(--primary); }
        .nav-unused { color: #aaa !important; }
        .nav-unused::after { content: '⚠️'; font-size: 10px; margin-left: 4px; }
        
        main {
            flex: 1;
            overflow-y: auto;
            border-radius: var(--radius);
            scroll-behavior: smooth;
        }
        
        .container { max-width: 1200px; margin: 0 auto; }
        
        .card {
            background: var(--card-bg);
            border-radius: var(--radius);
            padding: 24px;
            margin-bottom: 24px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.02);
            border: 1px solid var(--border);
        }
        
        .card.unused-table {
            border: 1px dashed #ccc;
            opacity: 0.8;
        }
        .card.unused-table h3::after {
            content: ' (Seems Unused)';
            color: #e6a23c;
            font-size: 14px;
            font-weight: normal;
        }
        
        .category-header {
            margin: 40px 0 20px 0;
            padding-bottom: 10px;
            border-bottom: 2px solid var(--border);
            color: var(--primary);
            font-size: 20px;
            font-weight: bold;
        }
        
        table { width: 100%; border-collapse: collapse; font-size: 14px; margin-top: 10px; table-layout: fixed; }
        th { text-align: left; color: #86868b; font-weight: 600; padding: 12px; border-bottom: 1px solid var(--border); background: #fafafa; }
        td { padding: 12px; border-bottom: 1px solid var(--border); vertical-align: top; word-wrap: break-word; }
        tr:last-child td { border-bottom: none; }
        
        .unused-row { color: #999; background: #fdfdfd; }
        .unused-row td:first-child::after {
            content: '⚠️';
            font-size: 12px;
            margin-left: 6px;
            title: "Analysis suggests not used in code";
            cursor: help;
        }
        
        .tag { display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: 600; margin-right: 4px; cursor: help; }
        .tag-pk { background: #fff3e0; color: #f5a623; border: 1px solid #ffe0b2; }
        .tag-fk { background: #e3f2fd; color: #2196f3; border: 1px solid #bbdefb; }
        
        .zh-name {
            display: block;
            color: #666;
            font-size: 12px;
            margin-top: 2px;
            font-weight: normal;
        }
        
        .method { display: inline-block; width: 50px; text-align: center; padding: 3px 0; border-radius: 4px; font-size: 10px; font-weight: bold; color: white; margin-right: 10px; }
        .get { background-color: #61affe; }
        .post { background-color: #49cc90; }
        .put { background-color: #fca130; }
        .delete { background-color: #f93e3e; }
        
        .api-list { background: #fafafa; border-radius: 8px; padding: 12px; margin-top: 15px; }
        .api-item { display: flex; align-items: center; margin-bottom: 8px; font-family: monospace; font-size: 12px; }
        
        .diagram-container {
            height: 600px;
            overflow: hidden; 
            background: #f8f9fa;
            border-radius: var(--radius);
            border: 1px solid #eee;
            position: relative;
        }
        
        .diagram-hint {
            position: absolute;
            top: 10px;
            right: 10px;
            background: rgba(255,255,255,0.8);
            padding: 5px 10px;
            border-radius: 4px;
            font-size: 12px;
            color: #666;
            z-index: 10;
        }
        
        .diagram-legend {
            margin-top: 5px;
            font-size: 12px;
            color: #666;
            padding: 10px;
            background: #fff3cd;
            border-radius: 6px;
        }
        
        [data-tooltip] {
            cursor: help;
        }
        
        #global-tooltip {
            position: fixed;
            background: rgba(0,0,0,0.85);
            color: white;
            padding: 8px 12px;
            border-radius: 6px;
            font-size: 12px;
            white-space: pre-wrap;
            z-index: 99999;
            pointer-events: none;
            box-shadow: 0 4px 12px rgba(0,0,0,0.2);
            line-height: 1.5;
            max-width: 400px;
            display: none;
            backdrop-filter: blur(4px);
        }
    </style>
    <script>
        document.addEventListener('DOMContentLoaded', () => {
             const tooltip = document.createElement('div');
             tooltip.id = 'global-tooltip';
             document.body.appendChild(tooltip);
             
             document.addEventListener('mouseover', (e) => {
                 if (e.target.hasAttribute('data-tooltip')) {
                     const text = e.target.getAttribute('data-tooltip');
                     tooltip.textContent = text;
                     tooltip.style.display = 'block';
                     
                     const rect = e.target.getBoundingClientRect();
                     // Default: Top Center
                     let left = rect.left + (rect.width / 2);
                     let top = rect.top - 8;
                     
                     // Constrain specific logic if needed (e.g. keep onscreen)
                     tooltip.style.left = `${left}px`;
                     tooltip.style.top = `${top}px`;
                     tooltip.style.transform = 'translate(-50%, -100%)';
                 }
             });
             
             document.addEventListener('mouseout', (e) => {
                 if (e.target.hasAttribute('data-tooltip')) {
                     tooltip.style.display = 'none';
                 }
             });
        });
    </script>
    </style>
</head>
<body>
    <aside>
        <div class="aside-header">
            <h2 style="margin:0;font-size:18px;">APS 数据库字典</h2>
            <div style="font-size:12px;color:#999;margin-top:5px;">Schema & API Dictionary</div>
            <div class="legend">⚠️ 表示代码中疑似未引用的表/字段 (Heuristic Analysis)</div>
        </div>
        <div class="aside-content">
            <a href="#diagram" style="display:block;padding:8px 12px;font-weight:600;color:#333;text-decoration:none;background:#f5f5f7;border-radius:6px;margin-bottom:10px;">📊 全局关系图 (ER Diagram)</a>
"""

    for cat in all_cats:
        cat_name = CATEGORY_MAP.get(cat, cat)
        html += f"""
        <details open>
            <summary>{cat_name}</summary>
            <ul class="nav-list">
        """
        for t in sorted(tables_by_category[cat]):
            table_class = "" if tables[t]['is_used'] else "nav-unused"
            html += f'<li><a href="#{t}" class="{table_class}">{t}</a></li>'
        html += """
            </ul>
        </details>
        """

    html += """
        </div>
    </aside>
    <main>
        <div class="container">
            <div class="card" id="diagram">
                <h2 style="margin-top:0;">全局数据库架构图 (可缩放/拖拽)</h2>
                <div class="diagram-container">
                    <div class="diagram-hint">鼠标滚轮缩放 / 拖拽移动</div>
                    <div class="mermaid">
"""
    html += mermaid_code
    html += """
                    </div>
                </div>
            </div>
"""
    
    for cat in all_cats:
        cat_name = CATEGORY_MAP.get(cat, cat)
        html += f'<h2 class="category-header">{cat_name}</h2>'
        
        for table_name in sorted(tables_by_category[cat]):
            info = tables[table_name]
            table_class = "unused-table" if not info['is_used'] else ""
            
            html += f'<div id="{table_name}" class="card {table_class}">'
            html += f'<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:15px;">'
            html += f'<h3 style="margin:0;font-size:18px;">{table_name}</h3>'
            html += f'<span style="font-size:12px;color:#999;background:#f5f5f7;padding:4px 8px;border-radius:4px;">{info["source_file"]}</span>'
            html += '</div>'
            
            html += '<table><thead><tr><th style="width:25%">字段 (Column)</th><th style="width:15%">类型 (Type)</th><th style="width:20%">属性 (Attributes)</th><th>说明 (Comment)</th></tr></thead><tbody>'
            for col in info['columns']:
                is_pk = info['primary_key'] and col['name'] in info['primary_key']
                
                # Check Referenced By (Inverse Relationship)
                referenced_by_list = []
                if is_pk:
                    # Finds references to this specific PK (assuming single column PK)
                    for ref in info.get('referenced_by', []):
                         # If FK points to this PK. Currently `referenced_by` stores target_column.
                         if ref['target_column'] == col['name']:
                             referenced_by_list.append(f"{ref['source_table']}.{ref['source_column']}")
                
                is_fk = False
                fk_target = ""
                fk_target_full = ""
                for fk in info['foreign_keys']:
                    if fk['column'] == col['name']:
                        is_fk = True
                        fk_target = fk['ref_table']
                        fk_target_full = f"{fk['ref_table']}.{fk['ref_column']}"
                        break
                
                name_html = f'<b>{col["name"]}</b>'
                
                zh_name = col["comment"].strip()
                if zh_name:
                    name_html += f'<span class="zh-name">{zh_name}</span>'
                
                if 'PRIMARY KEY' in col['attributes'].upper() or is_pk:
                    title_attr = ""
                    if referenced_by_list:
                        list_str = "&#10;".join(["<- " + r for r in referenced_by_list])
                        title_attr = f'data-tooltip="被以下字段引用 (Referenced By):&#10;{list_str}"'
                    else:
                        title_attr = 'data-tooltip="Primary Key"'
                    name_html += f' <span class="tag tag-pk" {title_attr}>PK</span>'
                    
                if is_fk:
                    name_html += f' <span class="tag tag-fk" data-tooltip="引用 (Refers To): {fk_target_full}">FK &rarr;</span>'
                
                row_class = "unused-row" if not col['is_used'] else ""
                
                # Check Type Translation
                translated_type = translate_type(col["type"])
                    
                html += f'<tr class="{row_class}"><td>{name_html}</td><td>{translated_type}</td><td>{col["attributes"]}</td><td>{col["comment"]}</td></tr>'
            html += '</tbody></table>'
            
            related_apis = []
            for group, routes in api_groups.items():
                normalized_table = table_name.lower().replace('_', '')
                normalized_group = group.lower().replace('_', '')
                if normalized_group in normalized_table or (normalized_table in normalized_group and len(normalized_group) > 3):
                    for r in routes:
                         related_apis.append({'method': r['method'], 'path': f"/api/{group}/{r['path'].lstrip('/')}"})
            
            if related_apis:
                html += '<div class="api-list">'
                html += '<div style="font-size:11px;font-weight:600;color:#999;margin-bottom:8px;">RELATED APIs</div>'
                for api in related_apis:
                    method_class = api['method'].lower()
                    html += f'<div class="api-item"><span class="method {method_class}">{api["method"]}</span>{api["path"]}</div>'
                html += '</div>'
                
            html += '</div>'

    html += """
        </div>
    </main>
</body>
</html>
"""
    with open(OUTPUT_HTML, 'w', encoding='utf-8') as f:
        f.write(html)
    print(f"Generated HTML at {OUTPUT_HTML}")

if __name__ == '__main__':
    content = load_codebase_content()
    
    print("Parsing SQL...")
    tables = parse_sql_files(content)
    print(f"Found {len(tables)} tables.")
    
    # Build cross-references map
    build_cross_references(tables)
    
    print("Parsing Routes...")
    api_groups = parse_routes()
    print(f"Found {len(api_groups)} route groups.")
    
    generate_html(tables, api_groups)
