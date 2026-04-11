import { buildWorkspaceMetadata } from "@/features/navigation/metadata";
import { ProcessTemplateListPage } from "@/features/process-template";

export const metadata = buildWorkspaceMetadata("process-templates");

export default function ProcessTemplatesPage() {
  return <ProcessTemplateListPage />;
}
