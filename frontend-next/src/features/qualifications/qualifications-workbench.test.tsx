import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppProviders } from "@/app/providers";
import { QualificationsWorkbench } from "./qualifications-workbench";
import type { QualificationWorkbenchTab } from "./presentation";

type MockQualification = {
  id: number;
  qualification_name: string;
};

function createImpactPayload(
  qualification: MockQualification,
  options?: {
    employeeRefs?: Array<{
      employee_code: string;
      employee_id: number;
      employee_name: string;
    }>;
    operationRefs?: Array<{
      operation_code: string;
      operation_id: number;
      operation_name: string;
    }>;
  },
) {
  const employeeRefs = options?.employeeRefs ?? [];
  const operationRefs = options?.operationRefs ?? [];

  return {
    qualification,
    counts: {
      employees: employeeRefs.length,
      operations: operationRefs.length,
    },
    employee_refs: employeeRefs,
    operation_refs: operationRefs,
    deletable: employeeRefs.length === 0 && operationRefs.length === 0,
  };
}

function installQualificationFetchMock() {
  let qualifications: MockQualification[] = [
    { id: 1, qualification_name: "洁净服认证" },
    { id: 2, qualification_name: "清场检查" },
  ];

  const employees = [
    {
      id: 11,
      employee_code: "E011",
      employee_name: "张三",
      department: "无菌车间",
      position: "操作员",
      unit_id: 110,
      unit_name: "A组",
    },
    {
      id: 12,
      employee_code: "E012",
      employee_name: "李四",
      department: "无菌车间",
      position: "班长",
      unit_id: 120,
      unit_name: "无菌二班",
    },
    {
      id: 13,
      employee_code: "E013",
      employee_name: "王五",
      department: "制剂二部",
      position: "操作员",
      unit_id: 210,
      unit_name: "制剂二班",
    },
  ];

  let assignments = [
    {
      id: 101,
      employee_id: 11,
      qualification_id: 1,
      qualification_level: 4,
    },
    {
      id: 102,
      employee_id: 12,
      qualification_id: 2,
      qualification_level: 2,
    },
  ];

  const impacts = new Map<number, ReturnType<typeof createImpactPayload>>([
    [
      1,
      createImpactPayload(
        { id: 1, qualification_name: "洁净服认证" },
        {
          employeeRefs: [
            {
              employee_code: "E011",
              employee_id: 11,
              employee_name: "张三",
            },
          ],
          operationRefs: [
            {
              operation_code: "OP-018",
              operation_id: 18,
              operation_name: "无菌灌装",
            },
          ],
        },
      ),
    ],
    [2, createImpactPayload({ id: 2, qualification_name: "清场检查" })],
  ]);

  function buildShortagePayload(yearMonth: string) {
    const qualifiedCountLevel4 = assignments.filter(
      (assignment) =>
        assignment.qualification_id === 1 && assignment.qualification_level >= 4,
    ).length;
    const qualifiedCountLevel2 = assignments.filter(
      (assignment) =>
        assignment.qualification_id === 2 && assignment.qualification_level >= 2,
    ).length;

    const riskItems = [
      {
        qualification_id: 1,
        qualification_name: "洁净服认证",
        required_level: 4,
        qualified_employee_count: qualifiedCountLevel4,
        demand_hours: 12,
        demand_person_instances: 2,
        active_batch_count: 1,
        active_operation_count: 1,
        peak_required_people: 2,
        peak_gap_people: Math.max(0, 2 - qualifiedCountLevel4),
        gap_rate: qualifiedCountLevel4 >= 2 ? 0 : 0.5,
        demand_hours_per_qualified_employee:
          qualifiedCountLevel4 > 0 ? 12 / qualifiedCountLevel4 : 12,
        coverage_fragility: 1,
        risk_score: qualifiedCountLevel4 >= 2 ? 45 : 63,
        score_breakdown: {
          coverage_fragility: 1,
          coverage_fragility_score: 10,
          demand_scale_factor: 1,
          demand_scale_score: 20,
          gap_rate: qualifiedCountLevel4 >= 2 ? 0 : 0.5,
          gap_rate_score: qualifiedCountLevel4 >= 2 ? 0 : 17.5,
          gap_volume_factor: qualifiedCountLevel4 >= 2 ? 0 : 1,
          gap_volume_score: qualifiedCountLevel4 >= 2 ? 0 : 20,
          load_pressure_factor: 1,
          load_pressure_score: 15,
        },
      },
      {
        qualification_id: 2,
        qualification_name: "清场检查",
        required_level: 2,
        qualified_employee_count: qualifiedCountLevel2,
        demand_hours: 12,
        demand_person_instances: 3,
        active_batch_count: 1,
        active_operation_count: 1,
        peak_required_people: 1,
        peak_gap_people: Math.max(0, 1 - qualifiedCountLevel2),
        gap_rate: 0,
        demand_hours_per_qualified_employee:
          qualifiedCountLevel2 > 0 ? 12 / qualifiedCountLevel2 : 12,
        coverage_fragility: 1,
        risk_score: qualifiedCountLevel2 > 0 ? 45 : 80,
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
    ];

    return {
      summary: {
        mode: "current_month",
        year_month: yearMonth,
        shortage_count: riskItems.filter((item) => item.peak_gap_people > 0).length,
        high_risk_coverable_count: riskItems.filter(
          (item) => item.peak_gap_people === 0 && item.risk_score >= 40,
        ).length,
        total_demand_hours: riskItems.reduce(
          (total, item) => total + item.demand_hours,
          0,
        ),
        average_risk_score: Math.round(
          riskItems.reduce((total, item) => total + item.risk_score, 0) /
            riskItems.length,
        ),
        max_risk_score: Math.max(...riskItems.map((item) => item.risk_score)),
        max_peak_gap: Math.max(...riskItems.map((item) => item.peak_gap_people)),
      },
      risk_items: riskItems,
      qualification_items: riskItems.map((item) => ({
        qualification_id: item.qualification_id,
        qualification_name: item.qualification_name,
        demand_hours: item.demand_hours,
        demand_person_instances: item.demand_person_instances,
        active_batch_count: item.active_batch_count,
        active_operation_count: item.active_operation_count,
        worst_required_level: item.required_level,
        worst_peak_gap_people: item.peak_gap_people,
        worst_risk_score: item.risk_score,
        level_breakdown: [item],
      })),
    };
  }

  function buildMonitoringPayload(yearMonth: string) {
    const shortages = buildShortagePayload(yearMonth);

    return {
      summary: shortages.summary,
      ranking: shortages.risk_items,
      heatmap: [
        {
          qualification_id: 1,
          qualification_name: "洁净服认证",
          qualification_rank: 1,
          required_level: 4,
          risk_score: shortages.risk_items[0]?.risk_score ?? null,
          peak_gap_people: shortages.risk_items[0]?.peak_gap_people ?? null,
          demand_hours: shortages.risk_items[0]?.demand_hours ?? null,
        },
        {
          qualification_id: 2,
          qualification_name: "清场检查",
          qualification_rank: 2,
          required_level: 2,
          risk_score: shortages.risk_items[1]?.risk_score ?? null,
          peak_gap_people: shortages.risk_items[1]?.peak_gap_people ?? null,
          demand_hours: shortages.risk_items[1]?.demand_hours ?? null,
        },
      ],
      trend: [
        {
          year_month: "2025-10",
          label: "2025-10",
          shortage_count: 0,
          high_risk_coverable_count: 1,
          average_risk_score: 32,
          max_risk_score: 45,
          total_demand_hours: 10,
        },
        {
          year_month: "2025-11",
          label: "2025-11",
          shortage_count: 1,
          high_risk_coverable_count: 0,
          average_risk_score: 44,
          max_risk_score: 58,
          total_demand_hours: 16,
        },
        {
          year_month: "2025-12",
          label: "2025-12",
          shortage_count: 1,
          high_risk_coverable_count: 1,
          average_risk_score: 48,
          max_risk_score: 60,
          total_demand_hours: 18,
        },
        {
          year_month: "2026-01",
          label: "2026-01",
          shortage_count: 1,
          high_risk_coverable_count: 1,
          average_risk_score: 50,
          max_risk_score: 61,
          total_demand_hours: 19,
        },
        {
          year_month: "2026-02",
          label: "2026-02",
          shortage_count: 1,
          high_risk_coverable_count: 1,
          average_risk_score: 52,
          max_risk_score: 62,
          total_demand_hours: 22,
        },
        {
          year_month: yearMonth,
          label: yearMonth,
          shortage_count: shortages.summary.shortage_count,
          high_risk_coverable_count: shortages.summary.high_risk_coverable_count,
          average_risk_score: shortages.summary.average_risk_score,
          max_risk_score: shortages.summary.max_risk_score,
          total_demand_hours: shortages.summary.total_demand_hours,
        },
      ],
    };
  }

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const url = typeof input === "string" ? input : input.toString();
    const parsedUrl = new URL(url, "http://localhost");

    if (url.endsWith("/qualifications/overview") && method === "GET") {
      const items = qualifications
        .map((qualification) => {
          const impact = impacts.get(qualification.id)!;
          return {
            id: qualification.id,
            qualification_name: qualification.qualification_name,
            employee_binding_count: impact.counts.employees,
            operation_binding_count: impact.counts.operations,
            total_binding_count: impact.counts.employees + impact.counts.operations,
            usage_state:
              impact.counts.employees > 0 && impact.counts.operations > 0
                ? "MIXED"
                : impact.counts.employees > 0
                  ? "EMPLOYEE_ONLY"
                  : impact.counts.operations > 0
                    ? "OPERATION_ONLY"
                    : "UNUSED",
            deletable: impact.deletable,
          };
        })
        .sort((left, right) =>
          left.qualification_name.localeCompare(right.qualification_name),
        );

      return new Response(
        JSON.stringify({
          totals: {
            qualification_count: items.length,
            in_use_count: items.filter((item) => item.total_binding_count > 0).length,
            employee_binding_count: items.reduce(
              (total, item) => total + item.employee_binding_count,
              0,
            ),
            operation_binding_count: items.reduce(
              (total, item) => total + item.operation_binding_count,
              0,
            ),
          },
          items,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const impactMatch = url.match(/\/qualifications\/(\d+)\/impact$/);
    if (impactMatch && method === "GET") {
      const qualificationId = Number(impactMatch[1]);
      return new Response(JSON.stringify(impacts.get(qualificationId)), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (url.endsWith("/qualifications") && method === "POST") {
      const payload = JSON.parse(String(init?.body));
      const created = {
        id: Math.max(...qualifications.map((item) => item.id)) + 1,
        qualification_name: payload.qualification_name,
      };
      qualifications = [...qualifications, created];
      impacts.set(created.id, createImpactPayload(created));
      return new Response(JSON.stringify(created), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    const qualificationMatch = url.match(/\/qualifications\/(\d+)$/);
    if (qualificationMatch && method === "PUT") {
      const qualificationId = Number(qualificationMatch[1]);
      const payload = JSON.parse(String(init?.body));
      qualifications = qualifications.map((qualification) =>
        qualification.id === qualificationId
          ? {
              ...qualification,
              qualification_name: payload.qualification_name,
            }
          : qualification,
      );
      const updated = qualifications.find((qualification) => qualification.id === qualificationId)!;
      const previousImpact = impacts.get(qualificationId)!;
      impacts.set(
        qualificationId,
        createImpactPayload(updated, {
          employeeRefs: previousImpact.employee_refs,
          operationRefs: previousImpact.operation_refs,
        }),
      );
      return new Response(JSON.stringify(updated), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (url.endsWith("/qualifications/matrix") && method === "GET") {
      return new Response(
        JSON.stringify({
          employees,
          qualifications,
          assignments,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    if (parsedUrl.pathname.endsWith("/org-structure/tree") && method === "GET") {
      return new Response(
        JSON.stringify({
          stats: {
            emptyLeadershipNodes: 0,
            orphanUnits: 0,
            totalLeaders: 0,
            totalUnits: 5,
          },
          unassignedEmployees: [],
          units: [
            {
              id: 100,
              parentId: null,
              unitType: "DEPARTMENT",
              unitCode: "D-100",
              unitName: "无菌车间",
              defaultShiftCode: null,
              sortOrder: 1,
              isActive: true,
              memberCount: 2,
              children: [
                {
                  id: 120,
                  parentId: 100,
                  unitType: "SHIFT",
                  unitCode: "S-120",
                  unitName: "无菌二班",
                  defaultShiftCode: null,
                  sortOrder: 1,
                  isActive: true,
                  memberCount: 1,
                  children: [
                    {
                      id: 110,
                      parentId: 120,
                      unitType: "GROUP",
                      unitCode: "G-110",
                      unitName: "A组",
                      defaultShiftCode: null,
                      sortOrder: 1,
                      isActive: true,
                      memberCount: 1,
                      children: [],
                    },
                  ],
                },
              ],
            },
            {
              id: 200,
              parentId: null,
              unitType: "DEPARTMENT",
              unitCode: "D-200",
              unitName: "制剂二部",
              defaultShiftCode: null,
              sortOrder: 2,
              isActive: true,
              memberCount: 1,
              children: [
                {
                  id: 210,
                  parentId: 200,
                  unitType: "SHIFT",
                  unitCode: "S-210",
                  unitName: "制剂二班",
                  defaultShiftCode: null,
                  sortOrder: 1,
                  isActive: true,
                  memberCount: 1,
                  children: [],
                },
              ],
            },
          ],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    if (parsedUrl.pathname.endsWith("/qualifications/shortages/monitoring") && method === "GET") {
      const yearMonth = parsedUrl.searchParams.get("year_month") ?? "2026-03";
      return new Response(JSON.stringify(buildMonitoringPayload(yearMonth)), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (parsedUrl.pathname.endsWith("/qualifications/shortages") && method === "GET") {
      const yearMonth = parsedUrl.searchParams.get("year_month") ?? "2026-03";
      return new Response(JSON.stringify(buildShortagePayload(yearMonth)), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (url.endsWith("/employee-qualifications") && method === "POST") {
      const payload = JSON.parse(String(init?.body));
      const created = {
        id: Math.max(...assignments.map((item) => item.id)) + 1,
        employee_id: payload.employee_id,
        qualification_id: payload.qualification_id,
        qualification_level: payload.qualification_level,
      };
      assignments = [...assignments, created];
      return new Response(JSON.stringify(created), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      });
    }

    const assignmentMatch = url.match(/\/employee-qualifications\/(\d+)$/);
    if (assignmentMatch && method === "PUT") {
      const assignmentId = Number(assignmentMatch[1]);
      const payload = JSON.parse(String(init?.body));
      assignments = assignments.map((assignment) =>
        assignment.id === assignmentId
          ? {
              ...assignment,
              qualification_level: payload.qualification_level,
            }
          : assignment,
      );

      return new Response(
        JSON.stringify(assignments.find((assignment) => assignment.id === assignmentId)),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    if (assignmentMatch && method === "DELETE") {
      const assignmentId = Number(assignmentMatch[1]);
      assignments = assignments.filter((assignment) => assignment.id !== assignmentId);
      return new Response(null, { status: 204 });
    }

    if (qualificationMatch && method === "DELETE") {
      const qualificationId = Number(qualificationMatch[1]);
      const impact = impacts.get(qualificationId)!;

      if (!impact.deletable) {
        return new Response(
          JSON.stringify({
            error: "QUALIFICATION_IN_USE",
            message: "This qualification is still referenced by employees or operations and cannot be deleted.",
            impact,
          }),
          {
            status: 409,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      qualifications = qualifications.filter(
        (qualification) => qualification.id !== qualificationId,
      );
      impacts.delete(qualificationId);
      return new Response(null, { status: 204 });
    }

    return new Response(null, { status: 404 });
  });

  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function renderWorkbench() {
  return render(
    <AppProviders>
      <QualificationsWorkbench />
    </AppProviders>,
  );
}

function renderWorkbenchWithTab(initialTab: QualificationWorkbenchTab) {
  return render(
    <AppProviders>
      <QualificationsWorkbench initialTab={initialTab} />
    </AppProviders>,
  );
}

describe("QualificationsWorkbench", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_API_BASE_URL = "/api";
    installQualificationFetchMock();
  });

  it("creates a qualification after search and filter controls render", async () => {
    const user = userEvent.setup();
    renderWorkbench();

    await screen.findByText("洁净服认证");

    const searchInput = screen.getByLabelText("搜索资质");
    await user.type(searchInput, "洁净");
    expect(await screen.findByText("洁净服认证")).toBeInTheDocument();

    await user.clear(searchInput);
    await user.click(screen.getByRole("button", { name: "新增资质" }));

    const nameInput = await screen.findByPlaceholderText("例如：无菌灌装操作证");
    await user.type(nameInput, "灌装资质");
    await user.click(screen.getByRole("button", { name: "保存资质" }));

    expect(await screen.findByText("灌装资质")).toBeInTheDocument();
  });

  it("shows a blocked deletion sheet for an in-use qualification", async () => {
    const user = userEvent.setup();
    renderWorkbench();

    const qualificationRow = (await screen.findByText("洁净服认证")).closest("tr");
    expect(qualificationRow).not.toBeNull();

    await user.click(
      within(qualificationRow as HTMLTableRowElement).getByRole("button", {
        name: "删除",
      }),
    );

    expect(await screen.findByText("无法删除：洁净服认证")).toBeInTheDocument();
    expect(screen.getByText("E011 张三")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "前往组织与人员" })).toBeInTheDocument();
  });

  it("edits and deletes an unused qualification", async () => {
    const user = userEvent.setup();
    renderWorkbench();

    const qualificationRow = (await screen.findByText("清场检查")).closest("tr");
    expect(qualificationRow).not.toBeNull();

    await user.click(
      within(qualificationRow as HTMLTableRowElement).getByRole("button", {
        name: "编辑",
      }),
    );

    const editorInput = await screen.findByPlaceholderText("例如：无菌灌装操作证");
    await user.clear(editorInput);
    await user.type(editorInput, "清场复核");
    await user.click(screen.getByRole("button", { name: "保存修改" }));

    expect(await screen.findByText("清场复核")).toBeInTheDocument();

    const renamedRow = screen.getByText("清场复核").closest("tr");
    expect(renamedRow).not.toBeNull();

    await user.click(
      within(renamedRow as HTMLTableRowElement).getByRole("button", {
        name: "删除",
      }),
    );

    expect(await screen.findByText("确认删除资质")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "确认删除" }));

    await waitFor(() => {
      expect(screen.queryByText("清场复核")).not.toBeInTheDocument();
    });
  });

  it("switches to the matrix tab and edits an employee qualification level", async () => {
    const user = userEvent.setup();
    renderWorkbenchWithTab("matrix");

    expect(await screen.findByRole("tab", { name: /资质矩阵/ })).toBeInTheDocument();
    expect(await screen.findByText("E011")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "向右浏览员工" })).toBeInTheDocument();

    const qualificationRow = (await screen.findByText("洁净服认证")).closest("tr");
    expect(qualificationRow).not.toBeNull();

    await user.click(
      within(qualificationRow as HTMLTableRowElement).getAllByRole("button", {
        name: /未持有/,
      })[0],
    );

    expect(await screen.findByText("李四 · 洁净服认证")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "4 级" }));
    await user.click(screen.getByRole("button", { name: "添加资质" }));

    await waitFor(() => {
      const updatedRow = screen.getByText("洁净服认证").closest("tr");
      expect(updatedRow).not.toBeNull();
      expect(
        within(updatedRow as HTMLTableRowElement).getAllByRole("button", {
          name: /4级/,
        }).length,
      ).toBeGreaterThan(1);
    });
  });

  it("filters employees by an organization node and keeps descendant assignments visible", async () => {
    const user = userEvent.setup();
    renderWorkbenchWithTab("matrix");

    expect(await screen.findByText("E011")).toBeInTheDocument();
    expect(screen.getByText("E012")).toBeInTheDocument();
    expect(screen.getByText("E013")).toBeInTheDocument();

    const organizationSelect = (await screen.findAllByRole("combobox"))[0];
    await user.selectOptions(organizationSelect, "100");

    await waitFor(() => {
      expect(screen.getByText("E011")).toBeInTheDocument();
      expect(screen.getByText("E012")).toBeInTheDocument();
      expect(screen.queryByText("E013")).not.toBeInTheDocument();
    });
  });

  it("shows demand-weighted shortage sections", async () => {
    const user = userEvent.setup();
    renderWorkbenchWithTab("shortages");

    expect(await screen.findByText("风险分排行")).toBeInTheDocument();
    expect(screen.getByText("硬短板")).toBeInTheDocument();
    expect(screen.getByText("高风险可覆盖")).toBeInTheDocument();
    expect(screen.getByText("等级风险热力图")).toBeInTheDocument();
    expect(screen.getByText("需求/供给对比")).toBeInTheDocument();
    expect(screen.getByText("月度趋势")).toBeInTheDocument();
    expect(screen.getAllByText("洁净服认证 ≥4级").length).toBeGreaterThan(0);
    expect(screen.getAllByText("清场检查 ≥2级").length).toBeGreaterThan(0);
    expect((await screen.findAllByText("需求工时 12h")).length).toBeGreaterThan(0);
    expect(screen.getByText("峰值缺口 1")).toBeInTheDocument();
    expect(screen.getAllByText("风险分 45")[0]).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: /资质矩阵/ }));
    expect(await screen.findByText("E011")).toBeInTheDocument();
  });
});
