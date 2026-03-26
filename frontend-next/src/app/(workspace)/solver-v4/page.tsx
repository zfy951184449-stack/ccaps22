import { buildWorkspaceMetadata } from "@/features/navigation/metadata";
import { RoutePlaceholderPage } from "@/features/workspace/route-placeholder-page";

export const metadata = buildWorkspaceMetadata("solver-v4");

export default function SolverV4Page() {
  return <RoutePlaceholderPage routeKey="solver-v4" />;
}
