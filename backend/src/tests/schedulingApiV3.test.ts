import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import request from "supertest";
import app from "../server";
import MLSchedulingService from "../services/mlSchedulingService";
import { ComprehensiveWorkTimeAdapter } from "../services/comprehensiveWorkTimeAdapter";

// Mock MLSchedulingService
vi.mock("../services/mlSchedulingService");
vi.mock("../services/comprehensiveWorkTimeAdapter");

describe("Scheduling API v3", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("POST /api/scheduling/auto-plan/v3", () => {
    it("should return 400 when batchIds is missing", async () => {
      const response = await request(app)
        .post("/api/scheduling/auto-plan/v3")
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toContain("batchIds");
    });

    it("should return 400 when batchIds is empty", async () => {
      const response = await request(app)
        .post("/api/scheduling/auto-plan/v3")
        .send({ batchIds: [] });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain("batchIds");
    });

    it("should return 400 when startDate is after endDate", async () => {
      const response = await request(app)
        .post("/api/scheduling/auto-plan/v3")
        .send({
          batchIds: [1],
          startDate: "2024-01-31",
          endDate: "2024-01-01",
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain("startDate cannot be later");
    });

    it("should call MLSchedulingService.autoPlanV3 with correct payload", async () => {
      const mockResult = {
        message: "智能排班完成",
        period: {
          startDate: "2024-01-01",
          endDate: "2024-01-31",
          quarter: "1",
        },
        batches: [],
        warnings: [],
        run: {
          id: 1,
          key: "test-key",
          status: "DRAFT" as const,
          resultId: 0,
        },
        summary: {
          employeesTouched: 0,
          operationsCovered: 0,
          overtimeEntries: 0,
          baseRosterRows: 0,
          operationsAssigned: 0,
        },
        diagnostics: {},
        logs: [],
        coverage: {
          totalOperations: 0,
          fullyCovered: 0,
          coverageRate: 0,
          gaps: [],
          gapTotals: {
            headcount: 0,
            qualification: 0,
            other: 0,
          },
        },
      };

      const mockAutoPlanV3 = vi
        .spyOn(MLSchedulingService.prototype, "autoPlanV3")
        .mockResolvedValue(mockResult);

      const response = await request(app)
        .post("/api/scheduling/auto-plan/v3")
        .send({
          batchIds: [1, 2],
          startDate: "2024-01-01",
          endDate: "2024-01-31",
        });

      expect(response.status).toBe(202);
      expect(response.body).toEqual(mockResult);
      expect(mockAutoPlanV3).toHaveBeenCalledWith({
        batchIds: [1, 2],
        startDate: "2024-01-01",
        endDate: "2024-01-31",
        options: {},
      });
    });

    it("should handle errors gracefully", async () => {
      const mockError = new Error("Test error");
      vi.spyOn(MLSchedulingService.prototype, "autoPlanV3").mockRejectedValue(
        mockError
      );

      const response = await request(app)
        .post("/api/scheduling/auto-plan/v3")
        .send({
          batchIds: [1],
        });

      expect(response.status).toBe(500);
      expect(response.body.error).toBe("Test error");
    });
  });

  describe("POST /api/scheduling/ml/predict-workload", () => {
    it("should return 400 when startDate is missing", async () => {
      const response = await request(app)
        .post("/api/scheduling/ml/predict-workload")
        .send({ endDate: "2024-01-31" });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain("startDate");
    });

    it("should return 400 when endDate is missing", async () => {
      const response = await request(app)
        .post("/api/scheduling/ml/predict-workload")
        .send({ startDate: "2024-01-01" });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain("endDate");
    });

    it("should return 400 when startDate is after endDate", async () => {
      const response = await request(app)
        .post("/api/scheduling/ml/predict-workload")
        .send({
          startDate: "2024-01-31",
          endDate: "2024-01-01",
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain("startDate cannot be later");
    });

    it("should call MLSchedulingService.predictWorkload with correct parameters", async () => {
      const mockPredictions = [
        {
          date: "2024-01-01",
          predictedWorkload: 100,
          confidence: 0.9,
          factors: {
            historicalAverage: 95,
            seasonalFactor: 1.05,
            trendFactor: 1.0,
          },
        },
      ];

      const mockPredictWorkload = vi
        .spyOn(MLSchedulingService.prototype, "predictWorkload")
        .mockResolvedValue(mockPredictions);

      const response = await request(app)
        .post("/api/scheduling/ml/predict-workload")
        .send({
          startDate: "2024-01-01",
          endDate: "2024-01-31",
        });

      expect(response.status).toBe(200);
      expect(response.body.predictions).toEqual(mockPredictions);
      expect(response.body.period.startDate).toBe("2024-01-01");
      expect(response.body.period.endDate).toBe("2024-01-31");
      expect(response.body.period.quarter).toBeDefined();
      expect(mockPredictWorkload).toHaveBeenCalledWith({
        startDate: "2024-01-01",
        endDate: "2024-01-31",
        quarter: expect.any(String),
      });
    });
  });

  describe("POST /api/scheduling/ml/evaluate", () => {
    it("should return 400 when schedules is missing", async () => {
      const response = await request(app)
        .post("/api/scheduling/ml/evaluate")
        .send({
          period: { startDate: "2024-01-01", endDate: "2024-01-31" },
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain("schedules");
    });

    it("should return 400 when schedules is not an array", async () => {
      const response = await request(app)
        .post("/api/scheduling/ml/evaluate")
        .send({
          schedules: "not-an-array",
          period: { startDate: "2024-01-01", endDate: "2024-01-31" },
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain("schedules");
    });

    it("should return 400 when period is missing", async () => {
      const response = await request(app)
        .post("/api/scheduling/ml/evaluate")
        .send({
          schedules: [
            {
              employeeId: 1,
              date: "2024-01-01",
              planHours: 8,
              overtimeHours: 0,
            },
          ],
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain("period");
    });

    it("should call MLSchedulingService.evaluateSchedule with correct parameters", async () => {
      const mockMetrics = {
        overallScore: 0.85,
        constraintCompliance: 0.9,
        costEfficiency: 0.8,
        employeeSatisfaction: 0.85,
        workloadBalance: 0.9,
        skillMatch: 0.8,
        details: {
          constraintViolations: [],
          costBreakdown: {
            totalCost: 1000,
            baseCost: 800,
            overtimeCost: 200,
            overheadCost: 0,
            costPerEmployee: 100,
          },
          satisfactionBreakdown: {
            averagePreferenceMatch: 0.85,
            employeesWithHighSatisfaction: 10,
            employeesWithLowSatisfaction: 2,
            preferenceMatchDistribution: {},
          },
          workloadDistribution: {
            averageHours: 40,
            standardDeviation: 5,
            minHours: 35,
            maxHours: 45,
          },
          skillMatchDetails: [],
        },
        recommendations: [],
      };

      const mockEvaluateSchedule = vi
        .spyOn(MLSchedulingService.prototype, "evaluateSchedule")
        .mockResolvedValue(mockMetrics);

      const schedules = [
        {
          employeeId: 1,
          date: "2024-01-01",
          planHours: 8,
          overtimeHours: 0,
        },
      ];

      const response = await request(app)
        .post("/api/scheduling/ml/evaluate")
        .send({
          schedules,
          period: {
            startDate: "2024-01-01",
            endDate: "2024-01-31",
          },
        });

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockMetrics);
      expect(mockEvaluateSchedule).toHaveBeenCalledWith(
        schedules,
        expect.objectContaining({
          startDate: "2024-01-01",
          endDate: "2024-01-31",
          quarter: expect.any(String),
        })
      );
    });
  });

  describe("POST /api/scheduling/comprehensive-work-time/check", () => {
    it("should return 400 when employeeId is missing", async () => {
      const response = await request(app)
        .post("/api/scheduling/comprehensive-work-time/check")
        .send({
          schedules: [],
          period: "MONTH",
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain("employeeId");
    });

    it("should return 400 when employeeId is not a number", async () => {
      const response = await request(app)
        .post("/api/scheduling/comprehensive-work-time/check")
        .send({
          employeeId: "not-a-number",
          schedules: [],
          period: "MONTH",
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain("employeeId");
    });

    it("should return 400 when schedules is missing", async () => {
      const response = await request(app)
        .post("/api/scheduling/comprehensive-work-time/check")
        .send({
          employeeId: 1,
          period: "MONTH",
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain("schedules");
    });

    it("should return 400 when period is missing", async () => {
      const response = await request(app)
        .post("/api/scheduling/comprehensive-work-time/check")
        .send({
          employeeId: 1,
          schedules: [],
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain("period");
    });

    it("should return 400 when period is invalid", async () => {
      const response = await request(app)
        .post("/api/scheduling/comprehensive-work-time/check")
        .send({
          employeeId: 1,
          schedules: [],
          period: "INVALID",
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain("period must be one of");
    });

    it("should call ComprehensiveWorkTimeAdapter.checkComprehensiveConstraints with correct parameters", async () => {
      const mockViolations = [
        {
          type: "COMPREHENSIVE_PERIOD_LIMIT",
          severity: "CRITICAL" as const,
          employeeId: 1,
          message: "周期工时超过上限",
          period: "MONTH" as const,
          accumulatedHours: 200,
          targetHours: 176,
        },
      ];

      const mockAdapter = {
        checkComprehensiveConstraints: vi
          .fn()
          .mockResolvedValue(mockViolations),
      };

      vi.mocked(ComprehensiveWorkTimeAdapter).mockImplementation(
        () => mockAdapter as any
      );

      const schedules = [
        {
          date: "2024-01-01",
          planHours: 8,
          overtimeHours: 0,
        },
      ];

      const response = await request(app)
        .post("/api/scheduling/comprehensive-work-time/check")
        .send({
          employeeId: 1,
          schedules,
          period: "MONTH",
        });

      expect(response.status).toBe(200);
      expect(response.body.employeeId).toBe(1);
      expect(response.body.period).toBe("MONTH");
      expect(response.body.violations).toEqual(mockViolations);
      expect(response.body.isValid).toBe(false);
      expect(response.body.violationCount).toBe(1);
      expect(mockAdapter.checkComprehensiveConstraints).toHaveBeenCalledWith(
        1,
        schedules,
        "MONTH"
      );
    });

    it("should return isValid=true when no violations", async () => {
      const mockAdapter = {
        checkComprehensiveConstraints: vi.fn().mockResolvedValue([]),
      };

      vi.mocked(ComprehensiveWorkTimeAdapter).mockImplementation(
        () => mockAdapter as any
      );

      const response = await request(app)
        .post("/api/scheduling/comprehensive-work-time/check")
        .send({
          employeeId: 1,
          schedules: [
            {
              date: "2024-01-01",
              planHours: 8,
              overtimeHours: 0,
            },
          ],
          period: "MONTH",
        });

      expect(response.status).toBe(200);
      expect(response.body.isValid).toBe(true);
      expect(response.body.violationCount).toBe(0);
    });
  });
});

