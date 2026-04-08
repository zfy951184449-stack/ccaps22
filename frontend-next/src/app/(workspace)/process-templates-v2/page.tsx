import { buildWorkspaceMetadata } from "@/features/navigation/metadata";
import { ProcessTemplateListPage } from "@/features/process-template-gantt/template-list-page";

export const metadata = buildWorkspaceMetadata("process-templates-v2");

export default function ProcessTemplatesV2Page() {
  return <ProcessTemplateListPage />;
}
