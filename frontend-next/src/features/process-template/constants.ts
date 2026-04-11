/* ── Process Template V1 – Constants ───────────────────────────────── */

/** Color palette for stages – indexed by stageOrder (mod length). */
export const STAGE_COLORS = [
  { border: "var(--pl-accent)", bg: "var(--pl-accent-soft)", text: "var(--pl-accent)" },
  { border: "#0d9488", bg: "#ccfbf1", text: "#0d9488" },       // teal
  { border: "#d97706", bg: "#fef3c7", text: "#d97706" },       // amber
  { border: "#7c3aed", bg: "#ede9fe", text: "#7c3aed" },       // violet
  { border: "#dc2626", bg: "#fee2e2", text: "#dc2626" },       // red
  { border: "#2563eb", bg: "#dbeafe", text: "#2563eb" },       // blue
] as const;

/** Resource type labels and icons. */
export const RESOURCE_TYPE_MAP: Record<string, { label: string; icon: string }> = {
  ROOM: { label: "房间", icon: "🏢" },
  EQUIPMENT: { label: "设备", icon: "⚗️" },
  VESSEL_CONTAINER: { label: "容器", icon: "🔬" },
  TOOLING: { label: "工具", icon: "🔧" },
  STERILIZATION_RESOURCE: { label: "灭菌资源", icon: "🧪" },
};

/** Share group visual colors. */
export const SHARE_GROUP_COLORS = [
  "#14b8a6", "#f59e0b", "#8b5cf6", "#ef4444",
  "#3b82f6", "#ec4899", "#10b981", "#f97316",
];

/** Virtual row ID for unassigned operations in resource view. */
export const UNASSIGNED_RESOURCE_ID = -1;
export const UNASSIGNED_RESOURCE_NAME = "⚠️ 待分配";
