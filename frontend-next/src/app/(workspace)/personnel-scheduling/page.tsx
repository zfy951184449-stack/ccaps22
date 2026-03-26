import { buildWorkspaceMetadata } from "@/features/navigation/metadata";
import { RoutePlaceholderPage } from "@/features/workspace/route-placeholder-page";

export const metadata = buildWorkspaceMetadata("personnel-scheduling");

export default function PersonnelSchedulingPage() {
  return <RoutePlaceholderPage routeKey="personnel-scheduling" />;
}
