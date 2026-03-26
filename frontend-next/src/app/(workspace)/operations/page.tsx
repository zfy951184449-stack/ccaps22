import { buildWorkspaceMetadata } from "@/features/navigation/metadata";
import { RoutePlaceholderPage } from "@/features/workspace/route-placeholder-page";

export const metadata = buildWorkspaceMetadata("operations");

export default function OperationsPage() {
  return <RoutePlaceholderPage routeKey="operations" />;
}
