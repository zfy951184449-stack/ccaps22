-- 人员排班系统初始数据插入脚本

USE aps_system;

-- 1. 插入班次类型数据
INSERT INTO shift_types (shift_code, shift_name, start_time, end_time, work_hours, is_night_shift, overtime_rate, description) VALUES
('DAY_SHIFT', '常日班', '08:30:00', '17:00:00', 8.00, FALSE, 1.0, '常日班，8:30-17:00，标准工时8小时'),
('LONG_DAY_SHIFT', '长白班', '08:30:00', '21:00:00', 11.00, FALSE, 1.2, '长白班，8:30-21:00，标准工时11小时'),
('NIGHT_SHIFT', '夜班', '20:30:00', '09:00:00', 11.00, TRUE, 1.5, '夜班，20:30-次日9:00，跨天班次，标准工时11小时');

-- 2. 插入排班规则数据
INSERT INTO scheduling_rules (rule_name, rule_type, rule_value, rule_unit, description) VALUES
('最小休息时间', 'MIN_REST_HOURS', 12.00, 'hours', '两个班次之间最小休息时间'),
('最大连续工作天数', 'MAX_CONSECUTIVE_DAYS', 6.00, 'days', '最大连续工作天数不超过6天'),
('夜班限制', 'NIGHT_SHIFT_LIMIT', 1.00, 'days', '连续夜班不超过1天'),
('跨天班次限制', 'CROSS_DAY_SHIFT_LIMIT', 2.00, 'days', '连续跨天班次不超过2天'),
('每日工时限制', 'DAILY_HOURS_LIMIT', 11.00, 'hours', '每天总工时（排班+加班）不超过11小时'),
('加班限制', 'OVERTIME_LIMIT', 36.00, 'hours', '每月加班不超过36小时'),
('夜班后休息', 'WEEKEND_REST', 1.00, 'days', '夜班后最低休息1天');

-- 3. 插入2024年法定节假日数据
INSERT INTO national_holidays (year, holiday_name, holiday_date, holiday_type, is_working_day, description) VALUES
-- 2024年法定节假日
(2024, '元旦', '2024-01-01', 'LEGAL_HOLIDAY', FALSE, '元旦节'),
(2024, '春节', '2024-02-10', 'LEGAL_HOLIDAY', FALSE, '春节假期'),
(2024, '春节', '2024-02-11', 'LEGAL_HOLIDAY', FALSE, '春节假期'),
(2024, '春节', '2024-02-12', 'LEGAL_HOLIDAY', FALSE, '春节假期'),
(2024, '春节', '2024-02-13', 'LEGAL_HOLIDAY', FALSE, '春节假期'),
(2024, '春节', '2024-02-14', 'LEGAL_HOLIDAY', FALSE, '春节假期'),
(2024, '春节', '2024-02-15', 'LEGAL_HOLIDAY', FALSE, '春节假期'),
(2024, '春节', '2024-02-16', 'LEGAL_HOLIDAY', FALSE, '春节假期'),
(2024, '春节', '2024-02-17', 'LEGAL_HOLIDAY', FALSE, '春节假期'),
(2024, '清明节', '2024-04-04', 'LEGAL_HOLIDAY', FALSE, '清明节'),
(2024, '清明节', '2024-04-05', 'LEGAL_HOLIDAY', FALSE, '清明节'),
(2024, '清明节', '2024-04-06', 'LEGAL_HOLIDAY', FALSE, '清明节'),
(2024, '劳动节', '2024-05-01', 'LEGAL_HOLIDAY', FALSE, '劳动节'),
(2024, '劳动节', '2024-05-02', 'LEGAL_HOLIDAY', FALSE, '劳动节'),
(2024, '劳动节', '2024-05-03', 'LEGAL_HOLIDAY', FALSE, '劳动节'),
(2024, '端午节', '2024-06-10', 'LEGAL_HOLIDAY', FALSE, '端午节'),
(2024, '中秋节', '2024-09-15', 'LEGAL_HOLIDAY', FALSE, '中秋节'),
(2024, '中秋节', '2024-09-16', 'LEGAL_HOLIDAY', FALSE, '中秋节'),
(2024, '中秋节', '2024-09-17', 'LEGAL_HOLIDAY', FALSE, '中秋节'),
(2024, '国庆节', '2024-10-01', 'LEGAL_HOLIDAY', FALSE, '国庆节'),
(2024, '国庆节', '2024-10-02', 'LEGAL_HOLIDAY', FALSE, '国庆节'),
(2024, '国庆节', '2024-10-03', 'LEGAL_HOLIDAY', FALSE, '国庆节'),
(2024, '国庆节', '2024-10-04', 'LEGAL_HOLIDAY', FALSE, '国庆节'),
(2024, '国庆节', '2024-10-05', 'LEGAL_HOLIDAY', FALSE, '国庆节'),
(2024, '国庆节', '2024-10-06', 'LEGAL_HOLIDAY', FALSE, '国庆节'),
(2024, '国庆节', '2024-10-07', 'LEGAL_HOLIDAY', FALSE, '国庆节'),

-- 2024年调休工作日
(2024, '春节调休', '2024-02-04', 'WEEKEND_ADJUSTMENT', TRUE, '春节调休工作日'),
(2024, '春节调休', '2024-02-18', 'WEEKEND_ADJUSTMENT', TRUE, '春节调休工作日'),
(2024, '清明节调休', '2024-04-07', 'WEEKEND_ADJUSTMENT', TRUE, '清明节调休工作日'),
(2024, '劳动节调休', '2024-04-28', 'WEEKEND_ADJUSTMENT', TRUE, '劳动节调休工作日'),
(2024, '劳动节调休', '2024-05-11', 'WEEKEND_ADJUSTMENT', TRUE, '劳动节调休工作日'),
(2024, '国庆节调休', '2024-09-29', 'WEEKEND_ADJUSTMENT', TRUE, '国庆节调休工作日'),
(2024, '国庆节调休', '2024-10-12', 'WEEKEND_ADJUSTMENT', TRUE, '国庆节调休工作日');

-- 4. 插入2025年法定节假日数据
INSERT INTO national_holidays (year, holiday_name, holiday_date, holiday_type, is_working_day, description) VALUES
-- 2025年法定节假日
(2025, '元旦', '2025-01-01', 'LEGAL_HOLIDAY', FALSE, '元旦节'),
(2025, '春节', '2025-01-28', 'LEGAL_HOLIDAY', FALSE, '春节假期'),
(2025, '春节', '2025-01-29', 'LEGAL_HOLIDAY', FALSE, '春节假期'),
(2025, '春节', '2025-01-30', 'LEGAL_HOLIDAY', FALSE, '春节假期'),
(2025, '春节', '2025-01-31', 'LEGAL_HOLIDAY', FALSE, '春节假期'),
(2025, '春节', '2025-02-01', 'LEGAL_HOLIDAY', FALSE, '春节假期'),
(2025, '春节', '2025-02-02', 'LEGAL_HOLIDAY', FALSE, '春节假期'),
(2025, '春节', '2025-02-03', 'LEGAL_HOLIDAY', FALSE, '春节假期'),
(2025, '清明节', '2025-04-05', 'LEGAL_HOLIDAY', FALSE, '清明节'),
(2025, '清明节', '2025-04-06', 'LEGAL_HOLIDAY', FALSE, '清明节'),
(2025, '清明节', '2025-04-07', 'LEGAL_HOLIDAY', FALSE, '清明节'),
(2025, '劳动节', '2025-05-01', 'LEGAL_HOLIDAY', FALSE, '劳动节'),
(2025, '劳动节', '2025-05-02', 'LEGAL_HOLIDAY', FALSE, '劳动节'),
(2025, '劳动节', '2025-05-03', 'LEGAL_HOLIDAY', FALSE, '劳动节'),
(2025, '端午节', '2025-05-31', 'LEGAL_HOLIDAY', FALSE, '端午节'),
(2025, '中秋节', '2025-10-06', 'LEGAL_HOLIDAY', FALSE, '中秋节'),
(2025, '中秋节', '2025-10-07', 'LEGAL_HOLIDAY', FALSE, '中秋节'),
(2025, '中秋节', '2025-10-08', 'LEGAL_HOLIDAY', FALSE, '中秋节'),
(2025, '国庆节', '2025-10-01', 'LEGAL_HOLIDAY', FALSE, '国庆节'),
(2025, '国庆节', '2025-10-02', 'LEGAL_HOLIDAY', FALSE, '国庆节'),
(2025, '国庆节', '2025-10-03', 'LEGAL_HOLIDAY', FALSE, '国庆节'),
(2025, '国庆节', '2025-10-04', 'LEGAL_HOLIDAY', FALSE, '国庆节'),
(2025, '国庆节', '2025-10-05', 'LEGAL_HOLIDAY', FALSE, '国庆节'),

-- 2025年调休工作日
(2025, '春节调休', '2025-01-26', 'WEEKEND_ADJUSTMENT', TRUE, '春节调休工作日'),
(2025, '春节调休', '2025-02-08', 'WEEKEND_ADJUSTMENT', TRUE, '春节调休工作日'),
(2025, '劳动节调休', '2025-04-27', 'WEEKEND_ADJUSTMENT', TRUE, '劳动节调休工作日'),
(2025, '劳动节调休', '2025-05-04', 'WEEKEND_ADJUSTMENT', TRUE, '劳动节调休工作日'),
(2025, '国庆节调休', '2025-09-28', 'WEEKEND_ADJUSTMENT', TRUE, '国庆节调休工作日'),
(2025, '国庆节调休', '2025-10-11', 'WEEKEND_ADJUSTMENT', TRUE, '国庆节调休工作日');

-- 5. 插入季度标准工时配置数据
INSERT INTO quarterly_standard_hours (year, quarter, total_days, weekend_days, legal_holiday_days, makeup_work_days, actual_working_days, standard_hours, calculation_details) VALUES
-- 2024年数据
(2024, 1, 91, 26, 8, 2, 59, 472.00, '{"weekend_days": 26, "legal_holidays": 8, "makeup_work": 2, "calculation": "91-26-8+2=59"}'),
(2024, 2, 91, 26, 4, 2, 63, 504.00, '{"weekend_days": 26, "legal_holidays": 4, "makeup_work": 2, "calculation": "91-26-4+2=63"}'),
(2024, 3, 92, 26, 3, 1, 64, 512.00, '{"weekend_days": 26, "legal_holidays": 3, "makeup_work": 1, "calculation": "92-26-3+1=64"}'),
(2024, 4, 92, 26, 7, 2, 61, 488.00, '{"weekend_days": 26, "legal_holidays": 7, "makeup_work": 2, "calculation": "92-26-7+2=61"}'),

-- 2025年数据
(2025, 1, 90, 26, 8, 2, 58, 464.00, '{"weekend_days": 26, "legal_holidays": 8, "makeup_work": 2, "calculation": "90-26-8+2=58"}'),
(2025, 2, 90, 26, 0, 1, 65, 520.00, '{"weekend_days": 26, "legal_holidays": 0, "makeup_work": 1, "calculation": "90-26-0+1=65"}'),
(2025, 3, 92, 26, 1, 1, 66, 528.00, '{"weekend_days": 26, "legal_holidays": 1, "makeup_work": 1, "calculation": "92-26-1+1=66"}'),
(2025, 4, 92, 26, 8, 2, 60, 480.00, '{"weekend_days": 26, "legal_holidays": 8, "makeup_work": 2, "calculation": "92-26-8+2=60"}');

-- 6. 插入示例排班数据（使用实际存在的员工ID）
-- 注意：使用实际employees表中的员工记录
INSERT INTO employee_schedule_history (employee_id, schedule_date, shift_type_id, start_time, end_time, work_hours, overtime_hours, status, notes, created_by) VALUES
-- 员工31的历史排班记录
(31, '2024-01-15', 1, '08:30:00', '17:00:00', 8.00, 0.00, 'COMPLETED', '正常排班', 31),
(31, '2024-01-16', 1, '08:30:00', '17:00:00', 8.00, 1.00, 'COMPLETED', '加班1小时', 31),
(31, '2024-01-17', 3, '20:30:00', '09:00:00', 11.00, 0.00, 'COMPLETED', '夜班', 31),
-- 休息一天（夜班后休息）
(31, '2024-01-19', 1, '08:30:00', '17:00:00', 8.00, 0.00, 'COMPLETED', '正常排班', 31),
(31, '2024-01-20', 2, '08:30:00', '21:00:00', 11.00, 0.00, 'COMPLETED', '长白班', 31),

-- 员工18的历史排班记录
(18, '2024-01-15', 2, '08:30:00', '21:00:00', 11.00, 0.00, 'COMPLETED', '长白班', 18),
(18, '2024-01-16', 1, '08:30:00', '17:00:00', 8.00, 0.00, 'COMPLETED', '正常排班', 18),
(18, '2024-01-17', 1, '08:30:00', '17:00:00', 8.00, 2.00, 'COMPLETED', '加班2小时', 18),

-- 未来排班计划
(31, '2025-01-15', 1, '08:30:00', '17:00:00', 8.00, 0.00, 'SCHEDULED', '计划排班', 31),
(31, '2025-01-16', 3, '20:30:00', '09:00:00', 11.00, 0.00, 'SCHEDULED', '夜班计划', 31),
(18, '2025-01-15', 2, '08:30:00', '21:00:00', 11.00, 0.00, 'SCHEDULED', '长白班计划', 18);

-- 7. 插入员工班次偏好数据（使用实际存在的员工ID）
INSERT INTO employee_shift_preferences (employee_id, shift_type_id, preference_score, is_available, notes) VALUES
-- 员工31的班次偏好
(31, 1, 8, TRUE, '偏好常日班'),
(31, 2, 5, TRUE, '可以接受长白班'),
(31, 3, 3, TRUE, '不太喜欢夜班但可以接受'),

-- 员工18的班次偏好
(18, 1, 7, TRUE, '偏好常日班'),
(18, 2, 9, TRUE, '很喜欢长白班'),
(18, 3, 1, FALSE, '不愿意上夜班'),

-- 员工6的班次偏好
(6, 1, 6, TRUE, '普通偏好常日班'),
(6, 2, 4, TRUE, '可以接受长白班'),
(6, 3, 8, TRUE, '适合夜班工作');