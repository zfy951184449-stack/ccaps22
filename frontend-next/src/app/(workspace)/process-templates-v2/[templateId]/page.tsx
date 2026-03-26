import { buildWorkspaceMetadata } from "@/features/navigation/metadata";
import { RoutePlaceholderPage } from "@/features/workspace/route-placeholder-page";

export const metadata = buildWorkspaceMetadata("process-templates-v2");

export default function ProcessTemplateV2EditorPage() {
  return <RoutePlaceholderPage routeKey="process-templates-v2" />;
}
