import { buildWorkspaceMetadata } from "@/features/navigation/metadata";
import { RoutePlaceholderPage } from "@/features/workspace/route-placeholder-page";

export const metadata = buildWorkspaceMetadata("process-templates");

export default function ProcessTemplatesPage() {
  return <RoutePlaceholderPage routeKey="process-templates" />;
}
