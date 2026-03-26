import { buildWorkspaceMetadata } from "@/features/navigation/metadata";
import { RoutePlaceholderPage } from "@/features/workspace/route-placeholder-page";

export const metadata = buildWorkspaceMetadata("batch-management-v4");

export default function BatchManagementV4Page() {
  return <RoutePlaceholderPage routeKey="batch-management-v4" />;
}
