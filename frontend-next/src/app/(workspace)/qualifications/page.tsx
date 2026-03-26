import { buildWorkspaceMetadata } from "@/features/navigation/metadata";
import { RoutePlaceholderPage } from "@/features/workspace/route-placeholder-page";

export const metadata = buildWorkspaceMetadata("qualifications");

export default function QualificationsPage() {
  return <RoutePlaceholderPage routeKey="qualifications" />;
}
