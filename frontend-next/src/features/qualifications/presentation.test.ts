import { describe, expect, it } from "vitest";
import {
  getRiskScorePresentation,
  filterAndSortQualifications,
  getQualificationLevelPresentation,
  partitionQualificationShortages,
  getUsageStatePresentation,
} from "./presentation";

const items = [
  {
    id: 1,
    qualification_name: "洁净服认证",
    employee_binding_count: 3,
    operation_binding_count: 1,
    total_binding_count: 4,
    usage_state: "MIXED" as const,
    deletable: false,
  },
  {
    id: 2,
    qualification_name: "清场检查",
    employee_binding_count: 0,
    operation_binding_count: 0,
    total_binding_count: 0,
    usage_state: "UNUSED" as const,
    deletable: true,
  },
  {
    id: 3,
    qualification_name: "灌装操作证",
    employee_binding_count: 2,
    operation_binding_count: 0,
    total_binding_count: 2,
    usage_state: "EMPLOYEE_ONLY" as const,
    deletable: false,
  },
];

describe("filterAndSortQualifications", () => {
  it("filters by search term and usage state", () => {
    const result = filterAndSortQualifications(items, {
      searchTerm: "灌装",
      sortOrder: "NAME_ASC",
      usageFilter: "EMPLOYEE_ONLY",
    });

    expect(result).toHaveLength(1);
    expect(result[0].qualification_name).toBe("灌装操作证");
  });

  it("supports descending sort order", () => {
    const result = filterAndSortQualifications(items, {
      searchTerm: "",
      sortOrder: "NAME_DESC",
      usageFilter: "ALL",
    });

    expect(result.map((item) => item.qualification_name)).toEqual([
      "灌装操作证",
      "清场检查",
      "洁净服认证",
    ]);
  });
});

describe("getUsageStatePresentation", () => {
  it("returns a consistent badge label and tone for blocked mixed usage", () => {
    expect(getUsageStatePresentation("MIXED")).toEqual({
      label: "人员+操作",
      tone: "accent",
    });
  });
});

describe("getQualificationLevelPresentation", () => {
  it("returns a stable label and palette for a middle qualification level", () => {
    expect(getQualificationLevelPresentation(3)).toMatchObject({
      label: "3级",
    });
  });

  it("clamps out-of-range levels into the supported 1-5 palette", () => {
    expect(getQualificationLevelPresentation(9)).toMatchObject({
      label: "5级",
    });
  });
});

describe("partitionQualificationShortages", () => {
  it("separates hard shortages from high-risk coverable items using risk score", () => {
    const result = partitionQualificationShortages([
      {
        qualification_id: 1,
        qualification_name: "洁净服认证",
        required_level: 4,
        qualified_employee_count: 1,
        demand_hours: 12,
        demand_person_instances: 2,
        active_batch_count: 1,
        active_operation_count: 1,
        peak_required_people: 2,
        peak_gap_people: 1,
        gap_rate: 0.5,
        demand_hours_per_qualified_employee: 12,
        coverage_fragility: 1,
        risk_score: 63,
        score_breakdown: {
          coverage_fragility: 1,
          coverage_fragility_score: 10,
          demand_scale_factor: 1,
          demand_scale_score: 20,
          gap_rate: 0.5,
          gap_rate_score: 17.5,
          gap_volume_factor: 1,
          gap_volume_score: 20,
          load_pressure_factor: 1,
          load_pressure_score: 15,
        },
      },
      {
        qualification_id: 2,
        qualification_name: "清场检查",
        required_level: 2,
        qualified_employee_count: 1,
        demand_hours: 12,
        demand_person_instances: 3,
        active_batch_count: 1,
        active_operation_count: 1,
        peak_required_people: 1,
        peak_gap_people: 0,
        gap_rate: 0,
        demand_hours_per_qualified_employee: 12,
        coverage_fragility: 1,
        risk_score: 45,
        score_breakdown: {
          coverage_fragility: 1,
          coverage_fragility_score: 10,
          demand_scale_factor: 1,
          demand_scale_score: 20,
          gap_rate: 0,
          gap_rate_score: 0,
          gap_volume_factor: 0,
          gap_volume_score: 0,
          load_pressure_factor: 1,
          load_pressure_score: 15,
        },
      },
    ]);

    expect(result.shortages).toHaveLength(1);
    expect(result.shortages[0]?.qualification_name).toBe("洁净服认证");
    expect(result.coverable).toHaveLength(1);
    expect(result.coverable[0]?.qualification_name).toBe("清场检查");
  });
});

describe("getRiskScorePresentation", () => {
  it("maps medium-high scores into an accent label set", () => {
    expect(getRiskScorePresentation(45)).toMatchObject({
      label: "关注 45分",
      tone: "accent",
    });
  });
});
