"use client";

import { Tabs } from "@/design-system/primitives/tabs";
import type { QualificationWorkbenchTab } from "./presentation";

const tabOptions = [
  {
    value: "list",
    label: "资质清单",
    description: "维护资质字典、影响范围和安全删除。",
  },
  {
    value: "matrix",
    label: "资质矩阵",
    description: "按员工查看资质覆盖，并直接调整员工资质等级。",
  },
  {
    value: "shortages",
    label: "短板分析",
    description: "基于已激活排产识别真实需求压力与峰值缺口。",
  },
] satisfies Array<{
  description: string;
  label: string;
  value: QualificationWorkbenchTab;
}>;

export function QualificationViewTabs({
  onChange,
  value,
}: {
  onChange: (value: QualificationWorkbenchTab) => void;
  value: QualificationWorkbenchTab;
}) {
  return <Tabs onChange={onChange} options={tabOptions} value={value} />;
}
