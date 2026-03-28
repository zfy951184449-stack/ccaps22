import { buildWorkspaceMetadata } from "@/features/navigation/metadata";
import { V3BioprocessWorkbench } from "@/features/v3-bioprocess/v3-bioprocess-workbench";

export const metadata = buildWorkspaceMetadata("resource-planning-v3");

export default function ResourcePlanningV3Page() {
  return <V3BioprocessWorkbench />;
}
