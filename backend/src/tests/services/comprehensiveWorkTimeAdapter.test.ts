import { describe, test, expect, beforeEach, vi } from "vitest";
import ComprehensiveWorkTimeAdapter, {
  type WorkTimeSystemConfig,
  type ScheduleRecord,
  type PeriodAccumulatedHoursDetail,
} from "../../services/comprehensiveWorkTimeAdapter";
import type { RowDataPacket } from "mysql2/promise";
import pool from "../../config/database";
import HolidayService from "../../services/holidayService";
import { HolidaySalaryConfigService } from "../../services/holidaySalaryConfigService";
import dayjs from "dayjs";
import quarterOfYear from "dayjs/plugin/quarterOfYear";

dayjs.extend(quarterOfYear);

vi.mock("../../config/database", () => ({
  default: {
    execute: vi.fn(),
  },
}));

vi.mock("../../services/holidayService", () => ({
  default: {
    ensureCalendarCoverage: vi.fn(() => Promise.resolve()),
  },
}));

vi.mock("../../services/holidaySalaryConfigService", () => ({
  HolidaySalaryConfigService: {
    isTripleSalaryHoliday: vi.fn(() => Promise.resolve(false)),
    getTripleSalaryHolidaysInPeriod: vi.fn(() => Promise.resolve([])),
  },
}));

describe("ComprehensiveWorkTimeAdapter", () => {
  let adapter: ComprehensiveWorkTimeAdapter;

  beforeEach(() => {
    adapter = new ComprehensiveWorkTimeAdapter();
    vi.clearAllMocks();
  });

  describe("getWorkTimeSystemConfig", () => {
    test("应该正确获取标准工时制配置", async () => {
      const mockRows = [
        {
          quarter_standard_hours: 480,
          month_standard_hours: 160,
          max_daily_hours: 11,
          max_consecutive_days: 6,
          effective_from: "2024-01-01",
          effective_to: null,
        },
      ] as RowDataPacket[];

      vi.mocked(pool.execute).mockResolvedValueOnce([[], []]); // Test columns query
      vi.mocked(pool.execute).mockResolvedValueOnce([mockRows, []]);

      const config = await adapter.getWorkTimeSystemConfig(1);

      expect(config).toBeDefined();
      expect(config?.workTimeSystemType).toBe("STANDARD");
      expect(config?.quarterStandardHours).toBe(480);
    });

    test("应该正确获取综合工时制配置", async () => {
      const mockTestRows = [
        { COLUMN_NAME: "work_time_system_type" },
        { COLUMN_NAME: "comprehensive_period" },
        { COLUMN_NAME: "comprehensive_target_hours" },
      ] as RowDataPacket[];

      const mockRows = [
        {
          work_time_system_type: "COMPREHENSIVE",
          comprehensive_period: "MONTH",
          comprehensive_target_hours: 160,
          quarter_standard_hours: 480,
          month_standard_hours: 160,
          max_daily_hours: 11,
          max_consecutive_days: 6,
          effective_from: "2024-01-01",
          effective_to: null,
        },
      ] as RowDataPacket[];

      vi.mocked(pool.execute).mockResolvedValueOnce([mockTestRows, []]);
      vi.mocked(pool.execute).mockResolvedValueOnce([mockRows, []]);

      const config = await adapter.getWorkTimeSystemConfig(1);

      expect(config).toBeDefined();
      expect(config?.workTimeSystemType).toBe("COMPREHENSIVE");
      expect(config?.comprehensivePeriod).toBe("MONTH");
      expect(config?.comprehensiveTargetHours).toBe(160);
    });

    test("应该处理无配置的员工", async () => {
      vi.mocked(pool.execute).mockResolvedValueOnce([[], []]);
      vi.mocked(pool.execute).mockResolvedValueOnce([[], []]);

      const config = await adapter.getWorkTimeSystemConfig(999);

      expect(config).toBeNull();
    });
  });

  describe("getPeriodStart and getPeriodEnd", () => {
    test("应该正确计算周周期的开始和结束日期", () => {
      const date = "2024-01-15"; // 周一
      const start = adapter.getPeriodStart(date, "WEEK");
      const end = adapter.getPeriodEnd(date, "WEEK");

      // dayjs默认周从周日开始，所以周一(1月15日)的周开始是周日(1月14日)
      expect(start.format("YYYY-MM-DD")).toBe("2024-01-14");
      expect(end.format("YYYY-MM-DD")).toBe("2024-01-20");
    });

    test("应该正确计算月周期的开始和结束日期", () => {
      const date = "2024-01-15";
      const start = adapter.getPeriodStart(date, "MONTH");
      const end = adapter.getPeriodEnd(date, "MONTH");

      expect(start.format("YYYY-MM-DD")).toBe("2024-01-01");
      expect(end.format("YYYY-MM-DD")).toBe("2024-01-31");
    });

    test("应该正确计算季度周期的开始和结束日期", () => {
      const date = "2024-02-15";
      const start = adapter.getPeriodStart(date, "QUARTER");
      const end = adapter.getPeriodEnd(date, "QUARTER");

      expect(start.format("YYYY-MM-DD")).toBe("2024-01-01");
      expect(end.format("YYYY-MM-DD")).toBe("2024-03-31");
    });

    test("应该正确计算年周期的开始和结束日期", () => {
      const date = "2024-06-15";
      const start = adapter.getPeriodStart(date, "YEAR");
      const end = adapter.getPeriodEnd(date, "YEAR");

      expect(start.format("YYYY-MM-DD")).toBe("2024-01-01");
      expect(end.format("YYYY-MM-DD")).toBe("2024-12-31");
    });
  });

  describe("calculateWorkingDays", () => {
    test("应该正确计算工作日数量", async () => {
      const mockRows = [{ working_days: 22 }] as RowDataPacket[];

      vi.mocked(pool.execute).mockResolvedValueOnce([mockRows, []]);

      const workingDays = await adapter.calculateWorkingDays(
        "2024-01-01",
        "2024-01-31"
      );

      expect(workingDays).toBe(22);
      expect(HolidayService.ensureCalendarCoverage).toHaveBeenCalled();
    });

    test("应该在数据库查询失败时使用估算方法", async () => {
      vi.mocked(pool.execute).mockRejectedValueOnce(new Error("Database error"));

      const workingDays = await adapter.calculateWorkingDays(
        "2024-01-01",
        "2024-01-07"
      );

      // 估算方法排除周末，1月1日是周一，1月7日是周日，应该有5个工作日
      expect(workingDays).toBeGreaterThan(0);
    });
  });

  describe("getPeriodTargetHours", () => {
    test("应该使用综合工时制配置的目标工时", async () => {
      const mockTestRows = [
        { COLUMN_NAME: "work_time_system_type" },
        { COLUMN_NAME: "comprehensive_period" },
        { COLUMN_NAME: "comprehensive_target_hours" },
      ] as RowDataPacket[];

      const mockConfigRows = [
        {
          work_time_system_type: "COMPREHENSIVE",
          comprehensive_period: "MONTH",
          comprehensive_target_hours: 160,
          quarter_standard_hours: 480,
          month_standard_hours: 160,
          max_daily_hours: 11,
          max_consecutive_days: 6,
          effective_from: "2024-01-01",
          effective_to: null,
        },
      ] as RowDataPacket[];

      const mockWorkingDaysRows = [{ working_days: 22 }] as RowDataPacket[];

      vi.mocked(pool.execute).mockResolvedValueOnce([mockTestRows, []]);
      vi.mocked(pool.execute).mockResolvedValueOnce([mockConfigRows, []]);
      vi.mocked(pool.execute).mockResolvedValueOnce([mockWorkingDaysRows, []]);

      const targetHours = await adapter.getPeriodTargetHours(
        1,
        "MONTH",
        "2024-01-01",
        "2024-01-31"
      );

      expect(targetHours).toBe(160);
    });

    test("应该根据工作日数计算标准工时制目标工时", async () => {
      const mockTestRows = [] as RowDataPacket[]; // 没有comprehensive字段，使用简化查询
      const mockRows = [
        {
          quarter_standard_hours: 480,
          month_standard_hours: 160,
          max_daily_hours: 11,
          max_consecutive_days: 6,
          effective_from: "2024-01-01",
          effective_to: null,
        },
      ] as RowDataPacket[];

      // Mock顺序：1. getWorkTimeSystemConfig检查列 2. getWorkTimeSystemConfig查询配置
      // 对于标准工时制，getPeriodTargetHours直接返回month_standard_hours，不需要计算工作日
      vi.mocked(pool.execute).mockResolvedValueOnce([mockTestRows, []]); // getWorkTimeSystemConfig: 检查列（标准工时制没有comprehensive字段）
      vi.mocked(pool.execute).mockResolvedValueOnce([mockRows, []]); // getWorkTimeSystemConfig: 查询配置

      const targetHours = await adapter.getPeriodTargetHours(
        1,
        "MONTH",
        "2024-01-01",
        "2024-01-31"
      );

      expect(targetHours).toBe(160); // 使用 month_standard_hours
    });
  });

  describe("getPeriodAccumulatedHours", () => {
    test("应该正确计算周期累计工时", async () => {
      const mockRows = [
        {
          normal_hours: "120.5",
          legal_holiday_hours: "0",
          total_hours: "120.5",
        },
      ] as RowDataPacket[];

      // Mock顺序：
      // 1. getPeriodAccumulatedHoursDetail -> HolidayService.ensureCalendarCoverage (已mock为resolve)
      // 2. getPeriodAccumulatedHoursDetail -> 查询累计工时（SQL SUM返回字符串或数字）
      // 3. getPeriodAccumulatedHoursDetail -> getLegalHolidaysInPeriod -> getTripleSalaryHolidaysInPeriod
      vi.mocked(pool.execute).mockResolvedValueOnce([mockRows, []]); // getPeriodAccumulatedHoursDetail: 查询累计工时
      vi.mocked(HolidaySalaryConfigService.getTripleSalaryHolidaysInPeriod).mockResolvedValueOnce([]); // getPeriodAccumulatedHoursDetail -> getLegalHolidaysInPeriod: 获取法定节假日

      const accumulatedHours = await adapter.getPeriodAccumulatedHours(
        1,
        "2024-01-01",
        "2024-01-31"
      );

      expect(accumulatedHours).toBe(120.5);
    });

    test("应该处理空排班记录", async () => {
      const mockRows = [
        {
          normal_hours: null,
          legal_holiday_hours: null,
          total_hours: null,
        },
      ] as RowDataPacket[];

      // Mock顺序：
      // 1. getPeriodAccumulatedHoursDetail -> HolidayService.ensureCalendarCoverage (已mock为resolve)
      // 2. getPeriodAccumulatedHoursDetail -> 查询累计工时（SQL SUM返回null当没有记录时）
      // 3. getPeriodAccumulatedHoursDetail -> getLegalHolidaysInPeriod -> getTripleSalaryHolidaysInPeriod
      vi.mocked(pool.execute).mockResolvedValueOnce([mockRows, []]); // getPeriodAccumulatedHoursDetail: 查询累计工时
      vi.mocked(HolidaySalaryConfigService.getTripleSalaryHolidaysInPeriod).mockResolvedValueOnce([]); // getPeriodAccumulatedHoursDetail -> getLegalHolidaysInPeriod: 获取法定节假日

      const accumulatedHours = await adapter.getPeriodAccumulatedHours(
        1,
        "2024-01-01",
        "2024-01-31"
      );

      expect(accumulatedHours).toBe(0);
    });
  });

  describe("isLegalHoliday", () => {
    test("应该正确识别法定节假日", async () => {
      vi.mocked(HolidaySalaryConfigService.isTripleSalaryHoliday).mockResolvedValueOnce(true);

      const isHoliday = await adapter.isLegalHoliday("2024-01-01");

      expect(isHoliday).toBe(true);
    });

    test("应该正确识别非法定节假日", async () => {
      vi.mocked(HolidaySalaryConfigService.isTripleSalaryHoliday).mockResolvedValueOnce(false);

      const isHoliday = await adapter.isLegalHoliday("2024-01-02");

      expect(isHoliday).toBe(false);
    });
  });

  describe("getLegalHolidaysInPeriod", () => {
    test("应该正确获取周期内的法定节假日列表", async () => {
      vi.mocked(HolidaySalaryConfigService.getTripleSalaryHolidaysInPeriod).mockResolvedValueOnce([
        "2024-01-01",
        "2024-01-02",
      ]);

      const holidays = await adapter.getLegalHolidaysInPeriod(
        "2024-01-01",
        "2024-01-31"
      );

      expect(holidays.length).toBe(2);
      expect(holidays).toContain("2024-01-01");
      expect(holidays).toContain("2024-01-02");
    });

    test("应该处理空法定节假日列表", async () => {
      vi.mocked(HolidaySalaryConfigService.getTripleSalaryHolidaysInPeriod).mockResolvedValueOnce([]);

      const holidays = await adapter.getLegalHolidaysInPeriod(
        "2024-01-05",
        "2024-01-10"
      );

      expect(holidays.length).toBe(0);
    });
  });

  describe("getPeriodAccumulatedHoursDetail", () => {
    test("应该正确区分正常工时和法定节假日工时", async () => {
      const mockDetailRows = [
        {
          normal_hours: "150",
          legal_holiday_hours: "24",
          total_hours: "174",
        },
      ] as RowDataPacket[];

      // Mock顺序：
      // 1. getPeriodAccumulatedHoursDetail -> HolidayService.ensureCalendarCoverage (已mock为resolve)
      // 2. getPeriodAccumulatedHoursDetail -> 查询累计工时（SQL SUM返回字符串或数字）
      // 3. getPeriodAccumulatedHoursDetail -> getLegalHolidaysInPeriod -> getTripleSalaryHolidaysInPeriod
      vi.mocked(pool.execute).mockResolvedValueOnce([mockDetailRows, []]); // 查询累计工时
      vi.mocked(HolidaySalaryConfigService.getTripleSalaryHolidaysInPeriod).mockResolvedValueOnce([
        "2024-01-01",
        "2024-01-02",
        "2024-01-03",
      ]); // getLegalHolidaysInPeriod: 查询法定节假日

      const detail = await adapter.getPeriodAccumulatedHoursDetail(
        1,
        "2024-01-01",
        "2024-01-31"
      );

      expect(detail.normalHours).toBe(150);
      expect(detail.legalHolidayHours).toBe(24);
      expect(detail.totalHours).toBe(174);
      expect(detail.legalHolidayDates.length).toBe(3);
    });
  });

  describe("calculatePeriodAccumulatedHoursFromSchedules", () => {
    test("应该正确从排班记录计算累计工时（排除法定节假日）", async () => {
      vi.mocked(HolidaySalaryConfigService.getTripleSalaryHolidaysInPeriod).mockResolvedValueOnce([
        "2024-01-01",
      ]); // getLegalHolidaysInPeriod

      const schedules: ScheduleRecord[] = [
        { date: "2024-01-01", planHours: 8, overtimeHours: 0 }, // 法定节假日，不计入正常工时
        { date: "2024-01-02", planHours: 8, overtimeHours: 1 },
        { date: "2024-01-03", planHours: 8, overtimeHours: 0 },
        { date: "2024-02-01", planHours: 8, overtimeHours: 0 }, // 超出周期
      ];

      const accumulatedHours = await adapter.calculatePeriodAccumulatedHoursFromSchedules(
        schedules,
        "2024-01-01",
        "2024-01-31",
        true // 排除法定节假日
      );

      expect(accumulatedHours).toBe(17); // 9 + 8 = 17（排除2024-01-01的8小时）
    });

    test("应该正确处理包含法定节假日的累计工时详情", async () => {
      vi.mocked(HolidaySalaryConfigService.getTripleSalaryHolidaysInPeriod).mockResolvedValueOnce([
        "2024-01-01",
      ]); // getLegalHolidaysInPeriod

      const schedules: ScheduleRecord[] = [
        { date: "2024-01-01", planHours: 8, overtimeHours: 0 }, // 法定节假日
        { date: "2024-01-02", planHours: 8, overtimeHours: 0 },
        { date: "2024-01-03", planHours: 8, overtimeHours: 0 },
      ];

      const detail = await adapter.calculatePeriodAccumulatedHoursDetailFromSchedules(
        schedules,
        "2024-01-01",
        "2024-01-31"
      );

      expect(detail.normalHours).toBe(16); // 8 + 8 = 16（排除法定节假日）
      expect(detail.legalHolidayHours).toBe(8); // 法定节假日工时
      expect(detail.totalHours).toBe(24); // 总工时
      expect(detail.legalHolidayDates).toContain("2024-01-01");
    });

    test("应该处理空排班记录", async () => {
      vi.mocked(HolidaySalaryConfigService.getTripleSalaryHolidaysInPeriod).mockResolvedValueOnce([]); // getLegalHolidaysInPeriod

      const schedules: ScheduleRecord[] = [];

      const accumulatedHours = await adapter.calculatePeriodAccumulatedHoursFromSchedules(
        schedules,
        "2024-01-01",
        "2024-01-31"
      );

      expect(accumulatedHours).toBe(0);
    });
  });

  describe("calculateComprehensiveOvertime", () => {
    test("应该正确计算综合工时制加班工时", () => {
      const overtime = adapter.calculateComprehensiveOvertime(180, 160, 0.1);

      expect(overtime).toBe(4); // 180 - 160 * 1.1 = 180 - 176 = 4
    });

    test("应该在容差范围内返回0", () => {
      const overtime = adapter.calculateComprehensiveOvertime(170, 160, 0.1);

      expect(overtime).toBe(0); // 170 < 160 * 1.1 = 176
    });

    test("应该处理0目标工时", () => {
      const overtime = adapter.calculateComprehensiveOvertime(100, 0, 0.1);

      expect(overtime).toBe(0);
    });
  });

  describe("checkComprehensiveConstraints", () => {
    test("应该检测周期工时超过上限", async () => {
      const mockTestRows = [
        { COLUMN_NAME: "work_time_system_type" },
        { COLUMN_NAME: "comprehensive_period" },
        { COLUMN_NAME: "comprehensive_target_hours" },
      ] as RowDataPacket[];

      const mockConfigRows = [
        {
          work_time_system_type: "COMPREHENSIVE",
          comprehensive_period: "MONTH",
          comprehensive_target_hours: 160,
          quarter_standard_hours: 480,
          month_standard_hours: 160,
          max_daily_hours: 11,
          max_consecutive_days: 6,
          effective_from: "2024-01-01",
          effective_to: null,
        },
      ] as RowDataPacket[];

      const mockWorkingDaysRows = [{ working_days: 22 }] as RowDataPacket[];

      // Mock顺序：
      // 1. checkComprehensiveConstraints -> getWorkTimeSystemConfig: 检查列
      // 2. checkComprehensiveConstraints -> getWorkTimeSystemConfig: 查询配置
      // 3. checkComprehensiveConstraints -> getPeriodTargetHours -> getWorkTimeSystemConfig: 检查列（再次调用）
      // 4. checkComprehensiveConstraints -> getPeriodTargetHours -> getWorkTimeSystemConfig: 查询配置（再次调用）
      //   注意：对于综合工时制且有comprehensiveTargetHours，getPeriodTargetHours直接返回该值，不需要计算工作日
      // 5. checkComprehensiveConstraints -> calculatePeriodAccumulatedHoursFromSchedules -> getLegalHolidaysInPeriod: 获取法定节假日
      // 6. checkComprehensiveConstraints -> calculateWorkingDays: 计算工作日（用于平均日工时检查）
      vi.mocked(pool.execute).mockResolvedValueOnce([mockTestRows, []]); // Get config: 检查列
      vi.mocked(pool.execute).mockResolvedValueOnce([mockConfigRows, []]); // Get config: 查询配置
      vi.mocked(pool.execute).mockResolvedValueOnce([mockTestRows, []]); // GetPeriodTargetHours -> getWorkTimeSystemConfig: 检查列
      vi.mocked(pool.execute).mockResolvedValueOnce([mockConfigRows, []]); // GetPeriodTargetHours -> getWorkTimeSystemConfig: 查询配置
      // 注意：由于有comprehensiveTargetHours，getPeriodTargetHours直接返回160，不需要calculateWorkingDays
      vi.mocked(HolidaySalaryConfigService.getTripleSalaryHolidaysInPeriod).mockResolvedValueOnce([]); // calculatePeriodAccumulatedHoursFromSchedules -> getLegalHolidaysInPeriod: 获取法定节假日
      vi.mocked(pool.execute).mockResolvedValueOnce([mockWorkingDaysRows, []]); // CheckConstraints -> calculateWorkingDays: 计算工作日

      const schedules: ScheduleRecord[] = [
        { date: "2024-01-01", planHours: 8, overtimeHours: 0 },
        { date: "2024-01-02", planHours: 8, overtimeHours: 0 },
        // ... 假设累计工时超过176 (160 * 1.1)
      ];

      // 模拟累计工时超过上限的情况（200小时，超过176上限）
      const totalHours = 200;
      for (let i = 0; i < Math.ceil(totalHours / 8); i++) {
        schedules.push({
          date: `2024-01-${String(i + 3).padStart(2, "0")}`,
          planHours: 8,
          overtimeHours: 0,
        });
      }

      const violations = await adapter.checkComprehensiveConstraints(
        1,
        schedules,
        "MONTH"
      );

      expect(violations.length).toBeGreaterThan(0);
      expect(violations.some((v) => v.type === "COMPREHENSIVE_PERIOD_LIMIT")).toBe(
        true
      );
    });

    test("应该检测平均日工时过高", async () => {
      const mockTestRows = [
        { COLUMN_NAME: "work_time_system_type" },
        { COLUMN_NAME: "comprehensive_period" },
        { COLUMN_NAME: "comprehensive_target_hours" },
      ] as RowDataPacket[];

      const mockConfigRows = [
        {
          work_time_system_type: "COMPREHENSIVE",
          comprehensive_period: "MONTH",
          comprehensive_target_hours: 160,
          quarter_standard_hours: 480,
          month_standard_hours: 160,
          max_daily_hours: 11,
          max_consecutive_days: 6,
          effective_from: "2024-01-01",
          effective_to: null,
        },
      ] as RowDataPacket[];

      const mockWorkingDaysRows = [{ working_days: 20 }] as RowDataPacket[];

      // Mock顺序：
      // 1. checkComprehensiveConstraints -> getWorkTimeSystemConfig: 检查列
      // 2. checkComprehensiveConstraints -> getWorkTimeSystemConfig: 查询配置
      // 3. checkComprehensiveConstraints -> getPeriodTargetHours -> getWorkTimeSystemConfig: 检查列（再次调用）
      // 4. checkComprehensiveConstraints -> getPeriodTargetHours -> getWorkTimeSystemConfig: 查询配置（再次调用）
      //   注意：对于综合工时制且有comprehensiveTargetHours，getPeriodTargetHours直接返回该值，不需要计算工作日
      // 5. checkComprehensiveConstraints -> calculatePeriodAccumulatedHoursFromSchedules -> getLegalHolidaysInPeriod: 获取法定节假日
      // 6. checkComprehensiveConstraints -> calculateWorkingDays: 计算工作日（用于平均日工时检查）
      vi.mocked(pool.execute).mockResolvedValueOnce([mockTestRows, []]); // Test columns query
      vi.mocked(pool.execute).mockResolvedValueOnce([mockConfigRows, []]); // Get config
      vi.mocked(pool.execute).mockResolvedValueOnce([mockTestRows, []]); // GetPeriodTargetHours -> getWorkTimeSystemConfig: 检查列
      vi.mocked(pool.execute).mockResolvedValueOnce([mockConfigRows, []]); // GetPeriodTargetHours -> getWorkTimeSystemConfig: 查询配置
      // 注意：由于有comprehensiveTargetHours，getPeriodTargetHours直接返回160，不需要calculateWorkingDays
      vi.mocked(HolidaySalaryConfigService.getTripleSalaryHolidaysInPeriod).mockResolvedValueOnce([]); // calculatePeriodAccumulatedHoursFromSchedules -> getLegalHolidaysInPeriod: 获取法定节假日
      vi.mocked(pool.execute).mockResolvedValueOnce([mockWorkingDaysRows, []]); // CheckConstraints -> calculateWorkingDays: 计算工作日

      // 平均日工时 = 180 / 20 = 9小时 > 8.5
      const schedules: ScheduleRecord[] = [];
      for (let i = 1; i <= 20; i++) {
        schedules.push({
          date: `2024-01-${String(i).padStart(2, "0")}`,
          planHours: 9,
          overtimeHours: 0,
        });
      }

      const violations = await adapter.checkComprehensiveConstraints(
        1,
        schedules,
        "MONTH"
      );

      expect(
        violations.some((v) => v.type === "COMPREHENSIVE_AVG_DAILY_HOURS")
      ).toBe(true);
    });

    test("应该跳过非综合工时制员工", async () => {
      const mockRows = [
        {
          quarter_standard_hours: 480,
          month_standard_hours: 160,
          max_daily_hours: 11,
          max_consecutive_days: 6,
          effective_from: "2024-01-01",
          effective_to: null,
        },
      ] as RowDataPacket[];

      vi.mocked(pool.execute).mockResolvedValueOnce([[], []]);
      vi.mocked(pool.execute).mockResolvedValueOnce([mockRows, []]);

      const schedules: ScheduleRecord[] = [
        { date: "2024-01-01", planHours: 8, overtimeHours: 0 },
      ];

      const violations = await adapter.checkComprehensiveConstraints(
        1,
        schedules,
        "MONTH"
      );

      expect(violations.length).toBe(0);
    });
  });

  describe("getBatchWorkTimeSystemConfigs", () => {
    test("应该批量获取多个员工的配置", async () => {
      const mockTestRows = [
        { COLUMN_NAME: "work_time_system_type" },
        { COLUMN_NAME: "comprehensive_period" },
        { COLUMN_NAME: "comprehensive_target_hours" },
      ] as RowDataPacket[];

      const mockRows = [
        {
          employee_id: "1", // 数据库可能返回字符串
          work_time_system_type: "COMPREHENSIVE",
          comprehensive_period: "MONTH",
          comprehensive_target_hours: 160,
          quarter_standard_hours: 480,
          month_standard_hours: 160,
          max_daily_hours: 11,
          max_consecutive_days: 6,
          effective_from: "2024-01-01",
          effective_to: null,
        },
        {
          employee_id: "2", // 数据库可能返回字符串
          work_time_system_type: "STANDARD",
          comprehensive_period: null,
          comprehensive_target_hours: null,
          quarter_standard_hours: 480,
          month_standard_hours: 160,
          max_daily_hours: 11,
          max_consecutive_days: 6,
          effective_from: "2024-01-01",
          effective_to: null,
        },
      ] as RowDataPacket[];

      // Mock的顺序：1. 检查列是否存在 2. 批量查询配置
      // 注意：getBatchWorkTimeSystemConfigs会传递date参数，默认是当前日期
      vi.mocked(pool.execute).mockResolvedValueOnce([mockTestRows, []]); // 检查列是否存在
      vi.mocked(pool.execute).mockResolvedValueOnce([mockRows, []]); // 批量查询配置（查询参数: [1, 2, date, date]）

      const configMap = await adapter.getBatchWorkTimeSystemConfigs([1, 2]);

      expect(configMap.size).toBe(2);
      expect(configMap.get(1)?.workTimeSystemType).toBe("COMPREHENSIVE");
      expect(configMap.get(2)?.workTimeSystemType).toBe("STANDARD");
    });

    test("应该处理空员工列表", async () => {
      const configMap = await adapter.getBatchWorkTimeSystemConfigs([]);

      expect(configMap.size).toBe(0);
    });
  });
});

