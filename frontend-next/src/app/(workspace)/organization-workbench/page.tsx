import { buildWorkspaceMetadata } from "@/features/navigation/metadata";
import { RoutePlaceholderPage } from "@/features/workspace/route-placeholder-page";

export const metadata = buildWorkspaceMetadata("organization-workbench");

export default function OrganizationWorkbenchPage() {
  return <RoutePlaceholderPage routeKey="organization-workbench" />;
}
