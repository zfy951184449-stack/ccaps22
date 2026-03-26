import { buildWorkspaceMetadata } from "@/features/navigation/metadata";
import { RoutePlaceholderPage } from "@/features/workspace/route-placeholder-page";

export const metadata = buildWorkspaceMetadata("qualification-matrix");

export default function QualificationMatrixPage() {
  return <RoutePlaceholderPage routeKey="qualification-matrix" />;
}
