import { buildWorkspaceMetadata } from "@/features/navigation/metadata";
import { RoutePlaceholderPage } from "@/features/workspace/route-placeholder-page";

export const metadata = buildWorkspaceMetadata("operation-types");

export default function OperationTypesPage() {
  return <RoutePlaceholderPage routeKey="operation-types" />;
}
