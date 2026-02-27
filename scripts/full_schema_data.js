const fullSchema = {
  "shift_types": [
    {
      "name": "id",
      "type": "INT",
      "comment": "",
      "tags": [
        "AutoInc",
        "PK"
      ]
    },
    {
      "name": "shift_code",
      "type": "VARCHAR(20)",
      "comment": "班次代码",
      "tags": [
        "Req",
        "Unique"
      ]
    },
    {
      "name": "shift_name",
      "type": "VARCHAR(50)",
      "comment": "班次名称",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "start_time",
      "type": "TIME",
      "comment": "开始时间",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "end_time",
      "type": "TIME",
      "comment": "结束时间",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "work_hours",
      "type": "DECIMAL(4,2)",
      "comment": "标准工时(小时)",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "is_night_shift",
      "type": "BOOLEAN",
      "comment": "是否夜班",
      "tags": []
    },
    {
      "name": "is_weekend_shift",
      "type": "BOOLEAN",
      "comment": "是否周末班",
      "tags": []
    },
    {
      "name": "overtime_rate",
      "type": "DECIMAL(3,2)",
      "comment": "加班费率",
      "tags": []
    },
    {
      "name": "description",
      "type": "TEXT",
      "comment": "班次描述",
      "tags": []
    },
    {
      "name": "is_active",
      "type": "BOOLEAN",
      "comment": "是否启用",
      "tags": []
    },
    {
      "name": "created_at",
      "type": "TIMESTAMP",
      "comment": "",
      "tags": []
    },
    {
      "name": "updated_at",
      "type": "TIMESTAMP",
      "comment": "",
      "tags": []
    }
  ],
  "personnel_schedules": [
    {
      "name": "id",
      "type": "INT",
      "comment": "",
      "tags": [
        "AutoInc",
        "PK"
      ]
    },
    {
      "name": "employee_id",
      "type": "INT",
      "comment": "员工ID",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "schedule_date",
      "type": "DATE",
      "comment": "排班日期",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "shift_type_id",
      "type": "INT",
      "comment": "班次类型ID",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "actual_start_time",
      "type": "DATETIME",
      "comment": "实际开始时间",
      "tags": []
    },
    {
      "name": "actual_end_time",
      "type": "DATETIME",
      "comment": "实际结束时间",
      "tags": []
    },
    {
      "name": "actual_work_hours",
      "type": "DECIMAL(4,2)",
      "comment": "实际工时(小时)",
      "tags": []
    },
    {
      "name": "status",
      "type": "ENUM('SCHEDULED',",
      "comment": "排班状态",
      "tags": []
    },
    {
      "name": "is_overtime",
      "type": "BOOLEAN",
      "comment": "是否加班",
      "tags": []
    },
    {
      "name": "overtime_hours",
      "type": "DECIMAL(4,2)",
      "comment": "加班时长",
      "tags": []
    },
    {
      "name": "notes",
      "type": "TEXT",
      "comment": "备注信息",
      "tags": []
    },
    {
      "name": "created_by",
      "type": "INT",
      "comment": "创建人ID",
      "tags": []
    },
    {
      "name": "created_at",
      "type": "TIMESTAMP",
      "comment": "",
      "tags": []
    },
    {
      "name": "updated_at",
      "type": "TIMESTAMP",
      "comment": "",
      "tags": []
    }
  ],
  "scheduling_rules": [
    {
      "name": "id",
      "type": "INT",
      "comment": "",
      "tags": [
        "AutoInc",
        "PK"
      ]
    },
    {
      "name": "rule_name",
      "type": "VARCHAR(100)",
      "comment": "规则名称",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "rule_type",
      "type": "ENUM('MIN_REST_HOURS',",
      "comment": "规则类型",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "rule_value",
      "type": "DECIMAL(8,2)",
      "comment": "规则值",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "rule_unit",
      "type": "VARCHAR(20)",
      "comment": "规则单位",
      "tags": []
    },
    {
      "name": "description",
      "type": "TEXT",
      "comment": "规则描述",
      "tags": []
    },
    {
      "name": "is_active",
      "type": "BOOLEAN",
      "comment": "是否启用",
      "tags": []
    },
    {
      "name": "created_at",
      "type": "TIMESTAMP",
      "comment": "",
      "tags": []
    },
    {
      "name": "updated_at",
      "type": "TIMESTAMP",
      "comment": "",
      "tags": []
    }
  ],
  "scheduling_conflicts": [
    {
      "name": "id",
      "type": "INT",
      "comment": "",
      "tags": [
        "AutoInc",
        "PK"
      ]
    },
    {
      "name": "conflict_type",
      "type": "ENUM('RULE_VIOLATION',",
      "comment": "冲突类型",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "employee_id",
      "type": "INT",
      "comment": "员工ID",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "schedule_id",
      "type": "INT",
      "comment": "排班ID",
      "tags": []
    },
    {
      "name": "conflict_date",
      "type": "DATE",
      "comment": "冲突日期",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "conflict_description",
      "type": "TEXT",
      "comment": "冲突描述",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "severity",
      "type": "ENUM('LOW',",
      "comment": "严重程度",
      "tags": []
    },
    {
      "name": "is_resolved",
      "type": "BOOLEAN",
      "comment": "是否已解决",
      "tags": []
    },
    {
      "name": "resolved_by",
      "type": "INT",
      "comment": "解决人ID",
      "tags": []
    },
    {
      "name": "resolved_at",
      "type": "TIMESTAMP",
      "comment": "解决时间",
      "tags": []
    },
    {
      "name": "resolution_notes",
      "type": "TEXT",
      "comment": "解决方案备注",
      "tags": []
    },
    {
      "name": "created_at",
      "type": "TIMESTAMP",
      "comment": "",
      "tags": []
    }
  ],
  "national_holidays": [
    {
      "name": "id",
      "type": "INT",
      "comment": "",
      "tags": [
        "AutoInc",
        "PK"
      ]
    },
    {
      "name": "year",
      "type": "INT",
      "comment": "年份",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "holiday_name",
      "type": "VARCHAR(100)",
      "comment": "节假日名称",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "holiday_date",
      "type": "DATE",
      "comment": "节假日日期",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "holiday_type",
      "type": "ENUM('LEGAL_HOLIDAY',",
      "comment": "节假日类型",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "is_working_day",
      "type": "BOOLEAN",
      "comment": "是否为工作日",
      "tags": []
    },
    {
      "name": "description",
      "type": "TEXT",
      "comment": "说明",
      "tags": []
    },
    {
      "name": "created_at",
      "type": "TIMESTAMP",
      "comment": "",
      "tags": []
    }
  ],
  "quarterly_standard_hours": [
    {
      "name": "id",
      "type": "INT",
      "comment": "",
      "tags": [
        "AutoInc",
        "PK"
      ]
    },
    {
      "name": "year",
      "type": "INT",
      "comment": "年份",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "quarter",
      "type": "INT",
      "comment": "季度(1-4)",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "total_days",
      "type": "INT",
      "comment": "该季度总天数",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "weekend_days",
      "type": "INT",
      "comment": "周末天数",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "legal_holiday_days",
      "type": "INT",
      "comment": "法定节假日天数",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "makeup_work_days",
      "type": "INT",
      "comment": "调休工作日天数",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "actual_working_days",
      "type": "INT",
      "comment": "实际工作日数",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "standard_hours",
      "type": "DECIMAL(5,2)",
      "comment": "标准工时(实际工作日*8小时)",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "calculation_details",
      "type": "TEXT",
      "comment": "计算详情JSON",
      "tags": []
    },
    {
      "name": "created_at",
      "type": "TIMESTAMP",
      "comment": "",
      "tags": []
    },
    {
      "name": "updated_at",
      "type": "TIMESTAMP",
      "comment": "",
      "tags": []
    }
  ],
  "employee_schedule_history": [
    {
      "name": "id",
      "type": "INT",
      "comment": "",
      "tags": [
        "AutoInc",
        "PK"
      ]
    },
    {
      "name": "employee_id",
      "type": "INT",
      "comment": "员工ID",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "schedule_date",
      "type": "DATE",
      "comment": "排班日期",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "shift_type_id",
      "type": "INT",
      "comment": "班次类型ID",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "start_time",
      "type": "TIME",
      "comment": "班次开始时间",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "end_time",
      "type": "TIME",
      "comment": "班次结束时间",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "work_hours",
      "type": "DECIMAL(4,2)",
      "comment": "工作时长(小时)",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "overtime_hours",
      "type": "DECIMAL(4,2)",
      "comment": "加班时长(小时)",
      "tags": []
    },
    {
      "name": "status",
      "type": "ENUM('SCHEDULED',",
      "comment": "排班状态",
      "tags": []
    },
    {
      "name": "notes",
      "type": "TEXT",
      "comment": "备注信息",
      "tags": []
    },
    {
      "name": "created_by",
      "type": "INT",
      "comment": "创建人ID",
      "tags": []
    },
    {
      "name": "created_at",
      "type": "TIMESTAMP",
      "comment": "",
      "tags": []
    },
    {
      "name": "updated_by",
      "type": "INT",
      "comment": "更新人ID",
      "tags": []
    },
    {
      "name": "updated_at",
      "type": "TIMESTAMP",
      "comment": "",
      "tags": []
    }
  ],
  "schedule_change_log": [
    {
      "name": "id",
      "type": "INT",
      "comment": "",
      "tags": [
        "AutoInc",
        "PK"
      ]
    },
    {
      "name": "schedule_history_id",
      "type": "INT",
      "comment": "排班历史记录ID",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "change_type",
      "type": "ENUM('CREATE',",
      "comment": "变更类型",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "old_values",
      "type": "JSON",
      "comment": "变更前的值",
      "tags": []
    },
    {
      "name": "new_values",
      "type": "JSON",
      "comment": "变更后的值",
      "tags": []
    },
    {
      "name": "change_reason",
      "type": "VARCHAR(500)",
      "comment": "变更原因",
      "tags": []
    },
    {
      "name": "changed_by",
      "type": "INT",
      "comment": "变更人ID",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "changed_at",
      "type": "TIMESTAMP",
      "comment": "变更时间",
      "tags": []
    },
    {
      "name": "approval_status",
      "type": "ENUM('PENDING',",
      "comment": "审批状态",
      "tags": []
    },
    {
      "name": "approved_by",
      "type": "INT",
      "comment": "审批人ID",
      "tags": []
    },
    {
      "name": "approved_at",
      "type": "TIMESTAMP",
      "comment": "审批时间",
      "tags": []
    },
    {
      "name": "approval_notes",
      "type": "TEXT",
      "comment": "审批备注",
      "tags": []
    }
  ],
  "employee_shift_preferences": [
    {
      "name": "id",
      "type": "INT",
      "comment": "",
      "tags": [
        "AutoInc",
        "PK"
      ]
    },
    {
      "name": "employee_id",
      "type": "INT",
      "comment": "员工ID",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "shift_type_id",
      "type": "INT",
      "comment": "班次类型ID",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "preference_score",
      "type": "INT",
      "comment": "偏好评分(-10到10)",
      "tags": []
    },
    {
      "name": "is_available",
      "type": "BOOLEAN",
      "comment": "是否可用",
      "tags": []
    },
    {
      "name": "notes",
      "type": "TEXT",
      "comment": "备注",
      "tags": []
    },
    {
      "name": "created_at",
      "type": "TIMESTAMP",
      "comment": "",
      "tags": []
    },
    {
      "name": "updated_at",
      "type": "TIMESTAMP",
      "comment": "",
      "tags": []
    }
  ],
  "holiday_update_log": [
    {
      "name": "id",
      "type": "INT",
      "comment": "",
      "tags": [
        "AutoInc",
        "PK"
      ]
    },
    {
      "name": "update_year",
      "type": "INT",
      "comment": "更新年份",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "update_source",
      "type": "VARCHAR(100)",
      "comment": "更新来源",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "update_time",
      "type": "TIMESTAMP",
      "comment": "更新时间",
      "tags": []
    },
    {
      "name": "records_count",
      "type": "INT",
      "comment": "更新记录数",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "update_status",
      "type": "ENUM('SUCCESS',",
      "comment": "更新状态",
      "tags": []
    },
    {
      "name": "error_message",
      "type": "TEXT",
      "comment": "错误信息",
      "tags": []
    }
  ],
  "departments": [
    {
      "name": "id",
      "type": "INT",
      "comment": "",
      "tags": [
        "AutoInc",
        "PK"
      ]
    },
    {
      "name": "parent_id",
      "type": "INT",
      "comment": "上级部门ID",
      "tags": []
    },
    {
      "name": "dept_code",
      "type": "VARCHAR(50)",
      "comment": "部门编码",
      "tags": [
        "Req",
        "Unique"
      ]
    },
    {
      "name": "dept_name",
      "type": "VARCHAR(100)",
      "comment": "部门名称",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "description",
      "type": "VARCHAR(255)",
      "comment": "部门描述",
      "tags": []
    },
    {
      "name": "sort_order",
      "type": "INT",
      "comment": "排序",
      "tags": []
    },
    {
      "name": "is_active",
      "type": "TINYINT(1)",
      "comment": "是否启用",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "created_at",
      "type": "DATETIME",
      "comment": "",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "updated_at",
      "type": "DATETIME",
      "comment": "",
      "tags": [
        "Req"
      ]
    }
  ],
  "teams": [
    {
      "name": "id",
      "type": "INT",
      "comment": "",
      "tags": [
        "AutoInc",
        "PK"
      ]
    },
    {
      "name": "department_id",
      "type": "INT",
      "comment": "所属部门ID",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "team_code",
      "type": "VARCHAR(50)",
      "comment": "班组编码",
      "tags": [
        "Req",
        "Unique"
      ]
    },
    {
      "name": "team_name",
      "type": "VARCHAR(100)",
      "comment": "班组名称",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "description",
      "type": "VARCHAR(255)",
      "comment": "描述",
      "tags": []
    },
    {
      "name": "is_active",
      "type": "TINYINT(1)",
      "comment": "是否启用",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "default_shift_code",
      "type": "VARCHAR(32)",
      "comment": "默认班次编码",
      "tags": []
    },
    {
      "name": "created_at",
      "type": "DATETIME",
      "comment": "",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "updated_at",
      "type": "DATETIME",
      "comment": "",
      "tags": [
        "Req"
      ]
    }
  ],
  "shifts": [
    {
      "name": "id",
      "type": "INT",
      "comment": "",
      "tags": [
        "AutoInc",
        "PK"
      ]
    },
    {
      "name": "team_id",
      "type": "INT",
      "comment": "所属班组ID",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "shift_code",
      "type": "VARCHAR(50)",
      "comment": "",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "shift_name",
      "type": "VARCHAR(100)",
      "comment": "",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "description",
      "type": "VARCHAR(255)",
      "comment": "",
      "tags": []
    },
    {
      "name": "sort_order",
      "type": "INT",
      "comment": "",
      "tags": []
    },
    {
      "name": "is_active",
      "type": "TINYINT(1)",
      "comment": "",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "created_at",
      "type": "DATETIME",
      "comment": "",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "updated_at",
      "type": "DATETIME",
      "comment": "",
      "tags": [
        "Req"
      ]
    }
  ],
  "employee_roles": [
    {
      "name": "id",
      "type": "INT",
      "comment": "",
      "tags": [
        "AutoInc",
        "PK"
      ]
    },
    {
      "name": "role_code",
      "type": "VARCHAR(50)",
      "comment": "角色编码",
      "tags": [
        "Req",
        "Unique"
      ]
    },
    {
      "name": "role_name",
      "type": "VARCHAR(100)",
      "comment": "角色名称",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "description",
      "type": "VARCHAR(255)",
      "comment": "描述",
      "tags": []
    },
    {
      "name": "can_schedule",
      "type": "TINYINT(1)",
      "comment": "是否参与排班",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "allowed_shift_codes",
      "type": "VARCHAR(255)",
      "comment": "允许的班次编码(逗号分隔)",
      "tags": []
    },
    {
      "name": "default_skill_level",
      "type": "TINYINT",
      "comment": "默认技能等级",
      "tags": []
    },
    {
      "name": "created_at",
      "type": "DATETIME",
      "comment": "",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "updated_at",
      "type": "DATETIME",
      "comment": "",
      "tags": [
        "Req"
      ]
    }
  ],
  "employee_team_roles": [
    {
      "name": "id",
      "type": "INT",
      "comment": "",
      "tags": [
        "AutoInc",
        "PK"
      ]
    },
    {
      "name": "employee_id",
      "type": "INT",
      "comment": "",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "team_id",
      "type": "INT",
      "comment": "",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "role_id",
      "type": "INT",
      "comment": "",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "shift_id",
      "type": "INT",
      "comment": "",
      "tags": []
    },
    {
      "name": "is_primary",
      "type": "TINYINT(1)",
      "comment": "是否主岗",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "effective_from",
      "type": "DATE",
      "comment": "生效开始",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "effective_to",
      "type": "DATE",
      "comment": "生效结束",
      "tags": []
    },
    {
      "name": "created_at",
      "type": "DATETIME",
      "comment": "",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "updated_at",
      "type": "DATETIME",
      "comment": "",
      "tags": [
        "Req"
      ]
    }
  ],
  "employee_unavailability": [
    {
      "name": "id",
      "type": "INT",
      "comment": "",
      "tags": [
        "AutoInc",
        "PK"
      ]
    },
    {
      "name": "employee_id",
      "type": "INT",
      "comment": "",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "start_datetime",
      "type": "DATETIME",
      "comment": "",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "end_datetime",
      "type": "DATETIME",
      "comment": "",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "reason_code",
      "type": "VARCHAR(50)",
      "comment": "原因编码",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "reason_label",
      "type": "VARCHAR(100)",
      "comment": "原因描述",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "category",
      "type": "VARCHAR(50)",
      "comment": "类别，如培训/休假/审计",
      "tags": []
    },
    {
      "name": "notes",
      "type": "VARCHAR(255)",
      "comment": "备注",
      "tags": []
    },
    {
      "name": "created_by",
      "type": "INT",
      "comment": "",
      "tags": []
    },
    {
      "name": "created_at",
      "type": "DATETIME",
      "comment": "",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "updated_at",
      "type": "DATETIME",
      "comment": "",
      "tags": [
        "Req"
      ]
    }
  ],
  "scheduling_metrics_snapshots": [
    {
      "name": "id",
      "type": "BIGINT",
      "comment": "",
      "tags": [
        "AutoInc",
        "Req"
      ]
    },
    {
      "name": "period_type",
      "type": "ENUM('MONTHLY',",
      "comment": "",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "period_start",
      "type": "DATE",
      "comment": "",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "period_end",
      "type": "DATE",
      "comment": "",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "overall_score",
      "type": "INT",
      "comment": "",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "grade",
      "type": "ENUM('EXCELLENT',",
      "comment": "",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "metrics_json",
      "type": "JSON",
      "comment": "",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "source",
      "type": "ENUM('AUTO_PLAN',",
      "comment": "",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "metadata_json",
      "type": "JSON",
      "comment": "",
      "tags": []
    },
    {
      "name": "created_at",
      "type": "DATETIME",
      "comment": "",
      "tags": [
        "Req"
      ]
    }
  ],
  "scheduling_metric_thresholds": [
    {
      "name": "id",
      "type": "BIGINT",
      "comment": "",
      "tags": [
        "AutoInc",
        "Req"
      ]
    },
    {
      "name": "metric_id",
      "type": "VARCHAR(128)",
      "comment": "",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "green_threshold",
      "type": "VARCHAR(64)",
      "comment": "",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "yellow_threshold",
      "type": "VARCHAR(64)",
      "comment": "",
      "tags": []
    },
    {
      "name": "red_threshold",
      "type": "VARCHAR(64)",
      "comment": "",
      "tags": []
    },
    {
      "name": "weight",
      "type": "DECIMAL(5,2)",
      "comment": "",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "created_at",
      "type": "DATETIME",
      "comment": "",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "updated_at",
      "type": "DATETIME",
      "comment": "",
      "tags": [
        "Req"
      ]
    }
  ],
  "production_batch_plans": [
    {
      "name": "id",
      "type": "INT",
      "comment": "批次计划ID",
      "tags": [
        "AutoInc",
        "PK"
      ]
    },
    {
      "name": "batch_code",
      "type": "VARCHAR(50)",
      "comment": "批次编号",
      "tags": [
        "Req",
        "Unique"
      ]
    },
    {
      "name": "batch_name",
      "type": "VARCHAR(100)",
      "comment": "批次名称",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "template_id",
      "type": "INT",
      "comment": "工艺模版ID",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "project_code",
      "type": "VARCHAR(50)",
      "comment": "项目代码",
      "tags": []
    },
    {
      "name": "planned_start_date",
      "type": "DATE",
      "comment": "计划开始日期（用户输入）",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "planned_end_date",
      "type": "DATE",
      "comment": "计划结束日期（将通过触发器计算）",
      "tags": []
    },
    {
      "name": "template_duration_days",
      "type": "INT",
      "comment": "模版标准工期（天）",
      "tags": []
    },
    {
      "name": "plan_status",
      "type": "ENUM('DRAFT',",
      "comment": "计划状态",
      "tags": []
    },
    {
      "name": "description",
      "type": "TEXT",
      "comment": "批次描述",
      "tags": []
    },
    {
      "name": "notes",
      "type": "TEXT",
      "comment": "备注信息",
      "tags": []
    },
    {
      "name": "created_at",
      "type": "TIMESTAMP",
      "comment": "",
      "tags": []
    },
    {
      "name": "updated_at",
      "type": "TIMESTAMP",
      "comment": "",
      "tags": []
    }
  ],
  "batch_operation_plans": [
    {
      "name": "id",
      "type": "INT",
      "comment": "操作计划ID",
      "tags": [
        "AutoInc",
        "PK"
      ]
    },
    {
      "name": "batch_plan_id",
      "type": "INT",
      "comment": "批次计划ID",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "template_schedule_id",
      "type": "INT",
      "comment": "模版操作安排ID",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "operation_id",
      "type": "INT",
      "comment": "操作ID",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "planned_start_datetime",
      "type": "DATETIME",
      "comment": "计划开始时间",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "planned_end_datetime",
      "type": "DATETIME",
      "comment": "计划结束时间",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "planned_duration",
      "type": "DECIMAL(5,2)",
      "comment": "计划持续时间(小时)",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "window_start_datetime",
      "type": "DATETIME",
      "comment": "允许最早开始时间",
      "tags": []
    },
    {
      "name": "window_end_datetime",
      "type": "DATETIME",
      "comment": "允许最晚完成时间",
      "tags": []
    },
    {
      "name": "required_people",
      "type": "INT",
      "comment": "计划需要人数",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "notes",
      "type": "TEXT",
      "comment": "计划备注",
      "tags": []
    },
    {
      "name": "is_locked",
      "type": "TINYINT(1)",
      "comment": "是否锁定",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "locked_by",
      "type": "INT",
      "comment": "锁定人ID",
      "tags": []
    },
    {
      "name": "locked_at",
      "type": "DATETIME",
      "comment": "锁定时间",
      "tags": []
    },
    {
      "name": "lock_reason",
      "type": "VARCHAR(255)",
      "comment": "锁定原因",
      "tags": []
    },
    {
      "name": "created_at",
      "type": "TIMESTAMP",
      "comment": "",
      "tags": []
    },
    {
      "name": "updated_at",
      "type": "TIMESTAMP",
      "comment": "",
      "tags": []
    }
  ],
  "batch_operation_constraints": [
    {
      "name": "id",
      "type": "INT",
      "comment": "批次约束ID",
      "tags": [
        "AutoInc",
        "PK"
      ]
    },
    {
      "name": "batch_plan_id",
      "type": "INT",
      "comment": "批次计划ID",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "batch_operation_plan_id",
      "type": "INT",
      "comment": "当前批次操作计划ID",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "predecessor_batch_operation_plan_id",
      "type": "INT",
      "comment": "前置批次操作计划ID",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "time_lag",
      "type": "DECIMAL(4,1)",
      "comment": "时间滞后（小时，可为负数）",
      "tags": []
    },
    {
      "name": "share_personnel",
      "type": "TINYINT(1)",
      "comment": "是否共享人员",
      "tags": []
    },
    {
      "name": "description",
      "type": "TEXT",
      "comment": "约束说明",
      "tags": []
    }
  ],
  "batch_personnel_assignments": [
    {
      "name": "id",
      "type": "INT",
      "comment": "人员安排ID",
      "tags": [
        "AutoInc",
        "PK"
      ]
    },
    {
      "name": "batch_operation_plan_id",
      "type": "INT",
      "comment": "批次操作计划ID",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "employee_id",
      "type": "INT",
      "comment": "员工ID",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "role",
      "type": "ENUM('OPERATOR',",
      "comment": "计划操作角色",
      "tags": []
    },
    {
      "name": "is_primary",
      "type": "BOOLEAN",
      "comment": "是否主要负责人",
      "tags": []
    },
    {
      "name": "qualification_level",
      "type": "INT",
      "comment": "员工相关资质等级",
      "tags": []
    },
    {
      "name": "qualification_match_score",
      "type": "DECIMAL(3,1)",
      "comment": "资质匹配度评分(0-10)",
      "tags": []
    },
    {
      "name": "assignment_status",
      "type": "ENUM('PLANNED',",
      "comment": "安排状态",
      "tags": []
    },
    {
      "name": "assigned_at",
      "type": "TIMESTAMP",
      "comment": "",
      "tags": []
    },
    {
      "name": "confirmed_at",
      "type": "TIMESTAMP",
      "comment": "确认时间",
      "tags": []
    },
    {
      "name": "notes",
      "type": "TEXT",
      "comment": "安排备注",
      "tags": []
    }
  ],
  "operation_constraints": [
    {
      "name": "id",
      "type": "INT",
      "comment": "约束ID",
      "tags": [
        "AutoInc",
        "PK"
      ]
    },
    {
      "name": "template_id",
      "type": "INT",
      "comment": "模版ID",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "from_operation_id",
      "type": "INT",
      "comment": "前置操作ID",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "to_operation_id",
      "type": "INT",
      "comment": "后续操作ID",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "lag_time",
      "type": "DECIMAL(5,2)",
      "comment": "延迟时间（小时）",
      "tags": []
    },
    {
      "name": "created_at",
      "type": "TIMESTAMP",
      "comment": "",
      "tags": []
    },
    {
      "name": "updated_at",
      "type": "TIMESTAMP",
      "comment": "",
      "tags": []
    }
  ],
  "personnel_share_groups": [
    {
      "name": "id",
      "type": "INT",
      "comment": "共享组ID",
      "tags": [
        "AutoInc",
        "PK"
      ]
    },
    {
      "name": "template_id",
      "type": "INT",
      "comment": "模版ID",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "group_code",
      "type": "VARCHAR(50)",
      "comment": "共享组代码",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "group_name",
      "type": "VARCHAR(100)",
      "comment": "共享组名称",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "description",
      "type": "TEXT",
      "comment": "描述",
      "tags": []
    },
    {
      "name": "color",
      "type": "VARCHAR(7)",
      "comment": "显示颜色",
      "tags": []
    },
    {
      "name": "created_at",
      "type": "TIMESTAMP",
      "comment": "",
      "tags": []
    },
    {
      "name": "updated_at",
      "type": "TIMESTAMP",
      "comment": "",
      "tags": []
    }
  ],
  "operation_share_group_relations": [
    {
      "name": "id",
      "type": "INT",
      "comment": "关联ID",
      "tags": [
        "AutoInc",
        "PK"
      ]
    },
    {
      "name": "template_id",
      "type": "INT",
      "comment": "模版ID",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "operation_id",
      "type": "INT",
      "comment": "操作ID",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "share_group_id",
      "type": "INT",
      "comment": "共享组ID",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "priority",
      "type": "INT",
      "comment": "优先级（用于排序）",
      "tags": []
    },
    {
      "name": "created_at",
      "type": "TIMESTAMP",
      "comment": "",
      "tags": []
    }
  ],
  "system_settings": [
    {
      "name": "id",
      "type": "INT",
      "comment": "",
      "tags": [
        "AutoInc",
        "PK"
      ]
    },
    {
      "name": "setting_key",
      "type": "VARCHAR(100)",
      "comment": "",
      "tags": [
        "Req",
        "Unique"
      ]
    },
    {
      "name": "setting_value",
      "type": "TEXT",
      "comment": "",
      "tags": []
    },
    {
      "name": "description",
      "type": "VARCHAR(255)",
      "comment": "",
      "tags": []
    },
    {
      "name": "updated_by",
      "type": "VARCHAR(100)",
      "comment": "",
      "tags": []
    },
    {
      "name": "updated_at",
      "type": "TIMESTAMP",
      "comment": "",
      "tags": []
    }
  ],
  "holiday_salary_config": [
    {
      "name": "id",
      "type": "INT",
      "comment": "",
      "tags": [
        "AutoInc",
        "PK"
      ]
    },
    {
      "name": "year",
      "type": "INT",
      "comment": "年份",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "calendar_date",
      "type": "DATE",
      "comment": "日期",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "holiday_name",
      "type": "VARCHAR(100)",
      "comment": "节假日名称",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "salary_multiplier",
      "type": "DECIMAL(3,2)",
      "comment": "工资倍数（3.00=3倍工资，2.00=2倍工资）",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "config_source",
      "type": "ENUM('RULE_ENGINE',",
      "comment": "配置来源",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "config_rule",
      "type": "VARCHAR(255)",
      "comment": "识别规则（如：春节前4天、国庆前3天等）",
      "tags": []
    },
    {
      "name": "region",
      "type": "VARCHAR(50)",
      "comment": "适用地区（NULL表示全国通用）",
      "tags": []
    },
    {
      "name": "is_active",
      "type": "TINYINT(1)",
      "comment": "是否启用",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "notes",
      "type": "TEXT",
      "comment": "备注说明",
      "tags": []
    },
    {
      "name": "created_at",
      "type": "TIMESTAMP",
      "comment": "创建时间",
      "tags": []
    },
    {
      "name": "updated_at",
      "type": "TIMESTAMP",
      "comment": "更新时间",
      "tags": []
    }
  ],
  "holiday_salary_rules": [
    {
      "name": "id",
      "type": "INT",
      "comment": "",
      "tags": [
        "AutoInc",
        "PK"
      ]
    },
    {
      "name": "rule_name",
      "type": "VARCHAR(100)",
      "comment": "规则名称",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "holiday_name",
      "type": "VARCHAR(100)",
      "comment": "节假日名称",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "rule_type",
      "type": "ENUM('FIXED_DATE',",
      "comment": "规则类型",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "rule_config",
      "type": "JSON",
      "comment": "规则配置（JSON格式）",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "salary_multiplier",
      "type": "DECIMAL(3,2)",
      "comment": "工资倍数",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "priority",
      "type": "INT",
      "comment": "优先级（数字越小优先级越高）",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "is_active",
      "type": "TINYINT(1)",
      "comment": "是否启用",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "description",
      "type": "TEXT",
      "comment": "规则描述",
      "tags": []
    },
    {
      "name": "created_at",
      "type": "TIMESTAMP",
      "comment": "创建时间",
      "tags": []
    },
    {
      "name": "updated_at",
      "type": "TIMESTAMP",
      "comment": "更新时间",
      "tags": []
    }
  ],
  "calendar_workdays": [
    {
      "name": "id",
      "type": "INT",
      "comment": "",
      "tags": [
        "AutoInc",
        "PK"
      ]
    },
    {
      "name": "calendar_date",
      "type": "DATE",
      "comment": "日期",
      "tags": [
        "Req",
        "Unique"
      ]
    },
    {
      "name": "is_workday",
      "type": "TINYINT(1)",
      "comment": "是否工作日 (1=工作日,0=休息日)",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "holiday_name",
      "type": "VARCHAR(100)",
      "comment": "节假日/调休名称",
      "tags": []
    },
    {
      "name": "holiday_type",
      "type": "ENUM('LEGAL_HOLIDAY',",
      "comment": "节假日类型",
      "tags": []
    },
    {
      "name": "source",
      "type": "ENUM('PRIMARY',",
      "comment": "数据来源",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "confidence",
      "type": "TINYINT",
      "comment": "可信度(0-100)",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "fetched_at",
      "type": "DATETIME",
      "comment": "抓取时间",
      "tags": []
    },
    {
      "name": "last_verified_at",
      "type": "DATETIME",
      "comment": "最近校验时间",
      "tags": []
    },
    {
      "name": "notes",
      "type": "VARCHAR(255)",
      "comment": "备注",
      "tags": []
    }
  ],
  "shift_definitions": [
    {
      "name": "id",
      "type": "INT",
      "comment": "",
      "tags": [
        "AutoInc",
        "PK"
      ]
    },
    {
      "name": "shift_code",
      "type": "VARCHAR(32)",
      "comment": "班次编码",
      "tags": [
        "Req",
        "Unique"
      ]
    },
    {
      "name": "shift_name",
      "type": "VARCHAR(100)",
      "comment": "班次名称",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "category",
      "type": "ENUM('STANDARD',",
      "comment": "班次类别",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "start_time",
      "type": "TIME",
      "comment": "起始时间",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "end_time",
      "type": "TIME",
      "comment": "结束时间 (跨日班次结束时间按次日时间记录)",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "is_cross_day",
      "type": "TINYINT(1)",
      "comment": "是否跨日",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "nominal_hours",
      "type": "DECIMAL(5,2)",
      "comment": "折算工时",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "max_extension_hours",
      "type": "DECIMAL(5,2)",
      "comment": "允许延长小时数（加班前提）",
      "tags": []
    },
    {
      "name": "description",
      "type": "TEXT",
      "comment": "说明",
      "tags": []
    },
    {
      "name": "is_active",
      "type": "TINYINT(1)",
      "comment": "是否启用",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "created_by",
      "type": "INT",
      "comment": "",
      "tags": []
    },
    {
      "name": "created_at",
      "type": "TIMESTAMP",
      "comment": "",
      "tags": []
    },
    {
      "name": "updated_at",
      "type": "TIMESTAMP",
      "comment": "",
      "tags": []
    }
  ],
  "employee_shift_limits": [
    {
      "name": "id",
      "type": "INT",
      "comment": "",
      "tags": [
        "AutoInc",
        "PK"
      ]
    },
    {
      "name": "employee_id",
      "type": "INT",
      "comment": "",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "effective_from",
      "type": "DATE",
      "comment": "",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "effective_to",
      "type": "DATE",
      "comment": "",
      "tags": []
    },
    {
      "name": "quarter_standard_hours",
      "type": "DECIMAL(6,2)",
      "comment": "季度标准工时(动态,可为空使用系统默认)",
      "tags": []
    },
    {
      "name": "month_standard_hours",
      "type": "DECIMAL(6,2)",
      "comment": "月度参考工时",
      "tags": []
    },
    {
      "name": "max_daily_hours",
      "type": "DECIMAL(4,2)",
      "comment": "每日工时上限",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "max_consecutive_days",
      "type": "INT",
      "comment": "连续上班天数上限",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "max_weekly_hours",
      "type": "DECIMAL(5,2)",
      "comment": "周工时上限(可选)",
      "tags": []
    },
    {
      "name": "remarks",
      "type": "VARCHAR(255)",
      "comment": "",
      "tags": []
    },
    {
      "name": "created_at",
      "type": "TIMESTAMP",
      "comment": "",
      "tags": []
    },
    {
      "name": "updated_at",
      "type": "TIMESTAMP",
      "comment": "",
      "tags": []
    }
  ],
  "employee_shift_plans": [
    {
      "name": "id",
      "type": "INT",
      "comment": "",
      "tags": [
        "AutoInc",
        "PK"
      ]
    },
    {
      "name": "employee_id",
      "type": "INT",
      "comment": "",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "plan_date",
      "type": "DATE",
      "comment": "",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "shift_id",
      "type": "INT",
      "comment": "关联班次定义 (休班可为空)",
      "tags": []
    },
    {
      "name": "plan_category",
      "type": "ENUM('BASE',",
      "comment": "班次类别",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "plan_state",
      "type": "ENUM('PLANNED',",
      "comment": "排班状态",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "plan_hours",
      "type": "DECIMAL(5,2)",
      "comment": "计划工时(折算)",
      "tags": []
    },
    {
      "name": "overtime_hours",
      "type": "DECIMAL(5,2)",
      "comment": "加班小时",
      "tags": []
    },
    {
      "name": "is_locked",
      "type": "TINYINT(1)",
      "comment": "是否锁定",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "locked_by",
      "type": "INT",
      "comment": "锁定人ID",
      "tags": []
    },
    {
      "name": "locked_at",
      "type": "DATETIME",
      "comment": "锁定时间",
      "tags": []
    },
    {
      "name": "lock_reason",
      "type": "VARCHAR(255)",
      "comment": "锁定原因",
      "tags": []
    },
    {
      "name": "batch_operation_plan_id",
      "type": "INT",
      "comment": "关联批次操作计划",
      "tags": []
    },
    {
      "name": "is_generated",
      "type": "TINYINT(1)",
      "comment": "是否系统生成(1)或手工(0)",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "created_by",
      "type": "INT",
      "comment": "",
      "tags": []
    },
    {
      "name": "updated_by",
      "type": "INT",
      "comment": "",
      "tags": []
    },
    {
      "name": "created_at",
      "type": "TIMESTAMP",
      "comment": "",
      "tags": []
    },
    {
      "name": "updated_at",
      "type": "TIMESTAMP",
      "comment": "",
      "tags": []
    }
  ],
  "overtime_records": [
    {
      "name": "id",
      "type": "INT",
      "comment": "",
      "tags": [
        "AutoInc",
        "PK"
      ]
    },
    {
      "name": "employee_id",
      "type": "INT",
      "comment": "",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "related_shift_plan_id",
      "type": "INT",
      "comment": "",
      "tags": []
    },
    {
      "name": "related_operation_plan_id",
      "type": "INT",
      "comment": "关联批次操作计划",
      "tags": []
    },
    {
      "name": "overtime_date",
      "type": "DATE",
      "comment": "",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "start_time",
      "type": "DATETIME",
      "comment": "",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "end_time",
      "type": "DATETIME",
      "comment": "",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "overtime_hours",
      "type": "DECIMAL(5,2)",
      "comment": "",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "status",
      "type": "ENUM('DRAFT',",
      "comment": "",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "approval_user_id",
      "type": "INT",
      "comment": "",
      "tags": []
    },
    {
      "name": "approval_time",
      "type": "DATETIME",
      "comment": "",
      "tags": []
    },
    {
      "name": "notes",
      "type": "TEXT",
      "comment": "",
      "tags": []
    },
    {
      "name": "created_by",
      "type": "INT",
      "comment": "",
      "tags": []
    },
    {
      "name": "created_at",
      "type": "TIMESTAMP",
      "comment": "",
      "tags": []
    }
  ],
  "shift_change_logs": [
    {
      "name": "id",
      "type": "INT",
      "comment": "",
      "tags": [
        "AutoInc",
        "PK"
      ]
    },
    {
      "name": "shift_plan_id",
      "type": "INT",
      "comment": "",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "change_type",
      "type": "ENUM('CREATE',",
      "comment": "",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "old_values",
      "type": "JSON",
      "comment": "",
      "tags": []
    },
    {
      "name": "new_values",
      "type": "JSON",
      "comment": "",
      "tags": []
    },
    {
      "name": "change_reason",
      "type": "VARCHAR(255)",
      "comment": "",
      "tags": []
    },
    {
      "name": "changed_by",
      "type": "INT",
      "comment": "",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "changed_at",
      "type": "TIMESTAMP",
      "comment": "",
      "tags": []
    },
    {
      "name": "approval_status",
      "type": "ENUM('NOT_REQUIRED',",
      "comment": "",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "approved_by",
      "type": "INT",
      "comment": "",
      "tags": []
    },
    {
      "name": "approved_at",
      "type": "TIMESTAMP",
      "comment": "",
      "tags": []
    },
    {
      "name": "approval_notes",
      "type": "TEXT",
      "comment": "",
      "tags": []
    }
  ],
  "employee_reporting_relations": [
    {
      "name": "id",
      "type": "INT",
      "comment": "",
      "tags": [
        "AutoInc",
        "PK"
      ]
    },
    {
      "name": "leader_id",
      "type": "INT",
      "comment": "直接上级员工ID",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "subordinate_id",
      "type": "INT",
      "comment": "直接下属员工ID",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "created_at",
      "type": "DATETIME",
      "comment": "",
      "tags": [
        "Req"
      ]
    }
  ],
  "organization_units": [
    {
      "name": "id",
      "type": "INT",
      "comment": "组织单元ID",
      "tags": [
        "AutoInc",
        "PK"
      ]
    },
    {
      "name": "parent_id",
      "type": "INT",
      "comment": "上级单元ID",
      "tags": []
    },
    {
      "name": "unit_type",
      "type": "ENUM('DEPARTMENT','TEAM','GROUP','SHIFT')",
      "comment": "单元类型",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "unit_code",
      "type": "VARCHAR(50)",
      "comment": "单元编码",
      "tags": []
    },
    {
      "name": "unit_name",
      "type": "VARCHAR(120)",
      "comment": "单元名称",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "default_shift_code",
      "type": "VARCHAR(50)",
      "comment": "默认班次编码",
      "tags": []
    },
    {
      "name": "sort_order",
      "type": "INT",
      "comment": "排序",
      "tags": []
    },
    {
      "name": "is_active",
      "type": "TINYINT(1)",
      "comment": "是否启用",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "metadata",
      "type": "JSON",
      "comment": "扩展信息",
      "tags": []
    },
    {
      "name": "created_at",
      "type": "DATETIME",
      "comment": "",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "updated_at",
      "type": "DATETIME",
      "comment": "",
      "tags": [
        "Req"
      ]
    }
  ],
  "employees": [
    {
      "name": "id",
      "type": "INT",
      "comment": "主键ID",
      "tags": [
        "AutoInc",
        "PK"
      ]
    },
    {
      "name": "employee_code",
      "type": "VARCHAR(20)",
      "comment": "工号",
      "tags": [
        "Req",
        "Unique"
      ]
    },
    {
      "name": "employee_name",
      "type": "VARCHAR(50)",
      "comment": "姓名",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "department",
      "type": "VARCHAR(50)",
      "comment": "部门",
      "tags": []
    },
    {
      "name": "position",
      "type": "VARCHAR(50)",
      "comment": "岗位",
      "tags": []
    },
    {
      "name": "org_role",
      "type": "ENUM('FRONTLINE','SHIFT_LEADER','GROUP_LEADER','TEAM_LEADER','DEPT_MANAGER')",
      "comment": "组织层级角色",
      "tags": [
        "Req"
      ]
    }
  ],
  "qualifications": [
    {
      "name": "id",
      "type": "INT",
      "comment": "资质ID",
      "tags": [
        "AutoInc",
        "PK"
      ]
    },
    {
      "name": "qualification_name",
      "type": "VARCHAR(100)",
      "comment": "资质名称",
      "tags": [
        "Req"
      ]
    }
  ],
  "employee_qualifications": [
    {
      "name": "id",
      "type": "INT",
      "comment": "主键ID",
      "tags": [
        "AutoInc",
        "PK"
      ]
    },
    {
      "name": "employee_id",
      "type": "INT",
      "comment": "人员ID",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "qualification_id",
      "type": "INT",
      "comment": "资质ID",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "qualification_level",
      "type": "TINYINT",
      "comment": "资质等级（1-5级）",
      "tags": [
        "Req"
      ]
    }
  ],
  "operations": [
    {
      "name": "id",
      "type": "INT",
      "comment": "操作ID",
      "tags": [
        "AutoInc",
        "PK"
      ]
    },
    {
      "name": "operation_code",
      "type": "VARCHAR(20)",
      "comment": "操作编码",
      "tags": [
        "Req",
        "Unique"
      ]
    },
    {
      "name": "operation_name",
      "type": "VARCHAR(100)",
      "comment": "操作名称",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "standard_time",
      "type": "DECIMAL(8,2)",
      "comment": "标准耗时（小时）",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "required_people",
      "type": "INT",
      "comment": "所需人数",
      "tags": []
    },
    {
      "name": "description",
      "type": "TEXT",
      "comment": "操作描述",
      "tags": []
    }
  ],
  "operation_qualification_requirements": [
    {
      "name": "id",
      "type": "INT",
      "comment": "主键ID",
      "tags": [
        "AutoInc",
        "PK"
      ]
    },
    {
      "name": "operation_id",
      "type": "INT",
      "comment": "操作ID",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "position_number",
      "type": "INT",
      "comment": "位置编号（从1开始）",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "qualification_id",
      "type": "INT",
      "comment": "资质ID",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "min_level",
      "type": "TINYINT",
      "comment": "最低等级要求（1-5级）",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "required_level",
      "type": "TINYINT",
      "comment": "要求等级（兼容旧逻辑）",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "required_count",
      "type": "INT",
      "comment": "该等级要求人数",
      "tags": []
    },
    {
      "name": "is_mandatory",
      "type": "TINYINT",
      "comment": "是否必须：1-必须，0-可选",
      "tags": []
    }
  ],
  "process_templates": [
    {
      "name": "id",
      "type": "INT",
      "comment": "模版ID",
      "tags": [
        "AutoInc",
        "PK"
      ]
    },
    {
      "name": "template_code",
      "type": "VARCHAR(20)",
      "comment": "模版编码",
      "tags": [
        "Req",
        "Unique"
      ]
    },
    {
      "name": "template_name",
      "type": "VARCHAR(100)",
      "comment": "模版名称",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "description",
      "type": "TEXT",
      "comment": "模版描述",
      "tags": []
    },
    {
      "name": "total_days",
      "type": "INT",
      "comment": "总工期（天）",
      "tags": []
    }
  ],
  "process_stages": [
    {
      "name": "id",
      "type": "INT",
      "comment": "阶段ID",
      "tags": [
        "AutoInc",
        "PK"
      ]
    },
    {
      "name": "template_id",
      "type": "INT",
      "comment": "模版ID",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "stage_code",
      "type": "VARCHAR(20)",
      "comment": "阶段编码",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "stage_name",
      "type": "VARCHAR(100)",
      "comment": "阶段名称",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "stage_order",
      "type": "INT",
      "comment": "在模版中的顺序",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "start_day",
      "type": "INT",
      "comment": "开始天数（从day0开始，day0=第1天）",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "description",
      "type": "TEXT",
      "comment": "阶段描述",
      "tags": []
    }
  ],
  "stage_operation_schedules": [
    {
      "name": "id",
      "type": "INT",
      "comment": "安排ID",
      "tags": [
        "AutoInc",
        "PK"
      ]
    },
    {
      "name": "stage_id",
      "type": "INT",
      "comment": "阶段ID",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "operation_id",
      "type": "INT",
      "comment": "操作ID",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "operation_day",
      "type": "INT",
      "comment": "操作相对天数（相对阶段开始的第几天，day0=阶段第1天）",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "recommended_time",
      "type": "DECIMAL(3,1)",
      "comment": "推荐开始时间（小时，0.5粒度）",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "recommended_day_offset",
      "type": "TINYINT",
      "comment": "推荐开始时间跨日偏移（相对于operation_day）",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "window_start_time",
      "type": "DECIMAL(3,1)",
      "comment": "窗口开始时间（小时，0.5粒度）",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "window_start_day_offset",
      "type": "TINYINT",
      "comment": "时间窗口开始跨日偏移（相对于operation_day）",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "window_end_time",
      "type": "DECIMAL(3,1)",
      "comment": "窗口结束时间（小时，0.5粒度）",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "window_end_day_offset",
      "type": "TINYINT",
      "comment": "时间窗口结束跨日偏移（相对于operation_day）",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "operation_order",
      "type": "INT",
      "comment": "操作在阶段中的顺序",
      "tags": []
    }
  ],
  "constraint_validation_cache": [
    {
      "name": "id",
      "type": "INT",
      "comment": "",
      "tags": [
        "AutoInc",
        "PK"
      ]
    },
    {
      "name": "template_id",
      "type": "INT",
      "comment": "",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "validation_hash",
      "type": "VARCHAR(64)",
      "comment": "MD5 hash of template state",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "validation_result",
      "type": "JSON",
      "comment": "",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "created_at",
      "type": "TIMESTAMP",
      "comment": "",
      "tags": []
    }
  ],
  "operation_types": [
    {
      "name": "id",
      "type": "INT",
      "comment": "",
      "tags": [
        "AutoInc",
        "PK"
      ]
    },
    {
      "name": "type_code",
      "type": "VARCHAR(20)",
      "comment": "",
      "tags": [
        "Req",
        "Unique"
      ]
    },
    {
      "name": "type_name",
      "type": "VARCHAR(50)",
      "comment": "",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "team_id",
      "type": "INT",
      "comment": "",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "color",
      "type": "VARCHAR(7)",
      "comment": "",
      "tags": []
    },
    {
      "name": "display_order",
      "type": "INT",
      "comment": "",
      "tags": []
    },
    {
      "name": "is_active",
      "type": "BOOLEAN",
      "comment": "",
      "tags": []
    },
    {
      "name": "created_at",
      "type": "TIMESTAMP",
      "comment": "",
      "tags": []
    },
    {
      "name": "updated_at",
      "type": "TIMESTAMP",
      "comment": "",
      "tags": []
    }
  ],
  "personnel_share_group_members": [
    {
      "name": "id",
      "type": "INT",
      "comment": "",
      "tags": [
        "AutoInc",
        "PK"
      ]
    },
    {
      "name": "group_id",
      "type": "INT",
      "comment": "",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "schedule_id",
      "type": "INT",
      "comment": "",
      "tags": [
        "Req"
      ]
    }
  ],
  "batch_share_groups": [
    {
      "name": "id",
      "type": "INT",
      "comment": "",
      "tags": [
        "AutoInc",
        "PK"
      ]
    },
    {
      "name": "batch_plan_id",
      "type": "INT",
      "comment": "",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "template_group_id",
      "type": "INT",
      "comment": "",
      "tags": []
    },
    {
      "name": "group_code",
      "type": "VARCHAR(20)",
      "comment": "",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "group_name",
      "type": "VARCHAR(50)",
      "comment": "",
      "tags": []
    },
    {
      "name": "share_mode",
      "type": "ENUM('SAME_TEAM',",
      "comment": "",
      "tags": []
    },
    {
      "name": "created_at",
      "type": "TIMESTAMP",
      "comment": "",
      "tags": []
    }
  ],
  "batch_share_group_members": [
    {
      "name": "id",
      "type": "INT",
      "comment": "",
      "tags": [
        "AutoInc",
        "PK"
      ]
    },
    {
      "name": "group_id",
      "type": "INT",
      "comment": "",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "batch_operation_plan_id",
      "type": "INT",
      "comment": "",
      "tags": [
        "Req"
      ]
    }
  ],
  "scheduling_runs": [
    {
      "name": "id",
      "type": "BIGINT",
      "comment": "",
      "tags": [
        "AutoInc",
        "Req"
      ]
    },
    {
      "name": "run_key",
      "type": "CHAR(36)",
      "comment": "",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "trigger_type",
      "type": "ENUM('AUTO_PLAN',",
      "comment": "",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "status",
      "type": "ENUM('DRAFT',",
      "comment": "",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "period_start",
      "type": "DATE",
      "comment": "",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "period_end",
      "type": "DATE",
      "comment": "",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "options_json",
      "type": "JSON",
      "comment": "",
      "tags": []
    },
    {
      "name": "summary_json",
      "type": "JSON",
      "comment": "",
      "tags": []
    },
    {
      "name": "warnings_json",
      "type": "JSON",
      "comment": "",
      "tags": []
    },
    {
      "name": "created_by",
      "type": "INT",
      "comment": "",
      "tags": []
    },
    {
      "name": "created_at",
      "type": "DATETIME",
      "comment": "",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "updated_at",
      "type": "DATETIME",
      "comment": "",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "completed_at",
      "type": "DATETIME",
      "comment": "",
      "tags": []
    }
  ],
  "scheduling_run_batches": [
    {
      "name": "id",
      "type": "BIGINT",
      "comment": "",
      "tags": [
        "AutoInc",
        "Req"
      ]
    },
    {
      "name": "run_id",
      "type": "BIGINT",
      "comment": "",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "batch_plan_id",
      "type": "INT",
      "comment": "",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "batch_code",
      "type": "VARCHAR(64)",
      "comment": "",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "window_start",
      "type": "DATETIME",
      "comment": "",
      "tags": []
    },
    {
      "name": "window_end",
      "type": "DATETIME",
      "comment": "",
      "tags": []
    },
    {
      "name": "total_operations",
      "type": "INT",
      "comment": "",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "created_at",
      "type": "DATETIME",
      "comment": "",
      "tags": [
        "Req"
      ]
    }
  ],
  "scheduling_results": [
    {
      "name": "id",
      "type": "BIGINT",
      "comment": "",
      "tags": [
        "AutoInc",
        "Req"
      ]
    },
    {
      "name": "run_id",
      "type": "BIGINT",
      "comment": "",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "result_state",
      "type": "ENUM('DRAFT',",
      "comment": "",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "version",
      "type": "INT",
      "comment": "",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "assignments_payload",
      "type": "JSON",
      "comment": "",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "coverage_payload",
      "type": "JSON",
      "comment": "",
      "tags": []
    },
    {
      "name": "logs_payload",
      "type": "JSON",
      "comment": "",
      "tags": []
    },
    {
      "name": "created_by",
      "type": "INT",
      "comment": "",
      "tags": []
    },
    {
      "name": "created_at",
      "type": "DATETIME",
      "comment": "",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "published_at",
      "type": "DATETIME",
      "comment": "",
      "tags": []
    }
  ],
  "scheduling_result_diffs": [
    {
      "name": "id",
      "type": "BIGINT",
      "comment": "",
      "tags": [
        "AutoInc",
        "Req"
      ]
    },
    {
      "name": "run_id",
      "type": "BIGINT",
      "comment": "",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "from_state",
      "type": "ENUM('DRAFT',",
      "comment": "",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "to_state",
      "type": "ENUM('DRAFT',",
      "comment": "",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "diff_payload",
      "type": "JSON",
      "comment": "",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "created_at",
      "type": "DATETIME",
      "comment": "",
      "tags": [
        "Req"
      ]
    }
  ],
  "scheduling_run_events": [
    {
      "name": "id",
      "type": "BIGINT",
      "comment": "",
      "tags": [
        "AutoInc",
        "Req"
      ]
    },
    {
      "name": "run_id",
      "type": "BIGINT",
      "comment": "",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "event_key",
      "type": "VARCHAR(64)",
      "comment": "",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "stage",
      "type": "ENUM(",
      "comment": "",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "status",
      "type": "ENUM('INFO',",
      "comment": "",
      "tags": [
        "Req"
      ]
    },
    {
      "name": "message",
      "type": "TEXT",
      "comment": "",
      "tags": []
    },
    {
      "name": "metadata",
      "type": "JSON",
      "comment": "",
      "tags": []
    },
    {
      "name": "created_at",
      "type": "DATETIME",
      "comment": "",
      "tags": [
        "Req"
      ]
    }
  ]
};
