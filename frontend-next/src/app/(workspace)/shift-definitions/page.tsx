import { buildWorkspaceMetadata } from "@/features/navigation/metadata";
import { RoutePlaceholderPage } from "@/features/workspace/route-placeholder-page";

export const metadata = buildWorkspaceMetadata("shift-definitions");

export default function ShiftDefinitionsPage() {
  return <RoutePlaceholderPage routeKey="shift-definitions" />;
}
