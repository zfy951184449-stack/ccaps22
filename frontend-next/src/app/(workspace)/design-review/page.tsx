import { buildWorkspaceMetadata } from "@/features/navigation/metadata";
import { DesignReviewWorkbench } from "@/features/design-review/design-review-workbench";

export const metadata = buildWorkspaceMetadata("design-review");

export default function DesignReviewPage() {
  return <DesignReviewWorkbench />;
}
