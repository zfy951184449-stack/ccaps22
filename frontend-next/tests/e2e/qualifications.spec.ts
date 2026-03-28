import { expect, test } from "@playwright/test";

test("runs the qualifications workbench pilot flow", async ({ page }) => {
  let qualifications = [
    { id: 1, qualification_name: "洁净服认证" },
    { id: 2, qualification_name: "清场检查" },
  ];

  const impactById = new Map([
    [
      1,
      {
        qualification: { id: 1, qualification_name: "洁净服认证" },
        counts: { employees: 1, operations: 1 },
        employee_refs: [
          {
            employee_id: 11,
            employee_code: "E011",
            employee_name: "张三",
          },
        ],
        operation_refs: [
          {
            operation_id: 18,
            operation_code: "OP-018",
            operation_name: "无菌灌装",
          },
        ],
        deletable: false,
      },
    ],
    [
      2,
      {
        qualification: { id: 2, qualification_name: "清场检查" },
        counts: { employees: 0, operations: 0 },
        employee_refs: [],
        operation_refs: [],
        deletable: true,
      },
    ],
  ]);

  await page.route(/\/api\/qualifications(?:\/.*)?$/, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const pathname = url.pathname;

    if (pathname.endsWith("/overview") && request.method() === "GET") {
      const items = qualifications
        .map((qualification) => {
          const impact = impactById.get(qualification.id)!;
          return {
            id: qualification.id,
            qualification_name: qualification.qualification_name,
            employee_binding_count: impact.counts.employees,
            operation_binding_count: impact.counts.operations,
            total_binding_count:
              impact.counts.employees + impact.counts.operations,
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

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          totals: {
            qualification_count: items.length,
            in_use_count: items.filter((item) => item.total_binding_count > 0)
              .length,
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
      });
      return;
    }

    const impactMatch = pathname.match(/\/api\/qualifications\/(\d+)\/impact$/);
    if (impactMatch && request.method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(impactById.get(Number(impactMatch[1]))),
      });
      return;
    }

    if (pathname.endsWith("/api/qualifications") && request.method() === "POST") {
      const payload = request.postDataJSON() as { qualification_name: string };
      const created = {
        id: 3,
        qualification_name: payload.qualification_name,
      };
      qualifications = [...qualifications, created];
      impactById.set(created.id, {
        qualification: created,
        counts: { employees: 0, operations: 0 },
        employee_refs: [],
        operation_refs: [],
        deletable: true,
      });

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(created),
      });
      return;
    }

    const qualificationMatch = pathname.match(/\/api\/qualifications\/(\d+)$/);
    if (qualificationMatch && request.method() === "PUT") {
      const qualificationId = Number(qualificationMatch[1]);
      const payload = request.postDataJSON() as { qualification_name: string };
      qualifications = qualifications.map((qualification) =>
        qualification.id === qualificationId
          ? {
              ...qualification,
              qualification_name: payload.qualification_name,
            }
          : qualification,
      );
      const updated = qualifications.find(
        (qualification) => qualification.id === qualificationId,
      )!;
      const previousImpact = impactById.get(qualificationId)!;
      impactById.set(qualificationId, {
        ...previousImpact,
        qualification: updated,
      });

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(updated),
      });
      return;
    }

    if (qualificationMatch && request.method() === "DELETE") {
      const qualificationId = Number(qualificationMatch[1]);
      const impact = impactById.get(qualificationId)!;

      if (!impact.deletable) {
        await route.fulfill({
          status: 409,
          contentType: "application/json",
          body: JSON.stringify({
            error: "QUALIFICATION_IN_USE",
            message:
              "This qualification is still referenced by employees or operations and cannot be deleted.",
            impact,
          }),
        });
        return;
      }

      qualifications = qualifications.filter(
        (qualification) => qualification.id !== qualificationId,
      );
      impactById.delete(qualificationId);

      await route.fulfill({
        status: 204,
        body: "",
      });
      return;
    }

    await route.continue();
  });

  await page.goto("/qualifications");

  await expect(page.getByRole("heading", { name: "资质运营台" })).toBeVisible();
  await expect(page.getByText("洁净服认证")).toBeVisible();

  await page.getByRole("button", { name: "新增资质" }).click();
  await page.getByPlaceholder("例如：无菌灌装操作证").fill("灌装资质");
  await page.getByRole("button", { name: "保存资质" }).click();
  await expect(page.getByText("灌装资质")).toBeVisible();

  const cleanCheckRow = page.locator("tr", { hasText: "清场检查" });
  await cleanCheckRow.getByRole("button", { name: "编辑" }).click();
  await page.getByPlaceholder("例如：无菌灌装操作证").fill("清场复核");
  await page.getByRole("button", { name: "保存修改" }).click();
  await expect(page.getByText("清场复核")).toBeVisible();

  const blockedRow = page.locator("tr", { hasText: "洁净服认证" });
  await blockedRow.getByRole("button", { name: "删除" }).click();
  await expect(page.getByText("无法删除：洁净服认证")).toBeVisible();
  await expect(page.getByRole("link", { name: "前往组织与人员" })).toBeVisible();
  await page.getByRole("button", { name: "知道了" }).click();

  const deletableRow = page.locator("tr", { hasText: "清场复核" });
  await deletableRow.getByRole("button", { name: "删除" }).click();
  await expect(page.getByText("确认删除资质")).toBeVisible();
  await page.getByRole("button", { name: "确认删除" }).click();
  await expect(page.locator("tr", { hasText: "清场复核" })).toHaveCount(0);
});
