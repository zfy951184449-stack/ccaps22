/* ── Process Template Editor – Page Shell ─────────────────────────────
 *
 * Dynamic route page for /process-templates/[templateId].
 * Delegates to the TemplateEditor feature component.
 */

import { buildWorkspaceMetadata } from "@/features/navigation/metadata";
import { TemplateEditorClient } from "./client";

export const metadata = buildWorkspaceMetadata("process-templates");

export default async function ProcessTemplateEditorPage({
  params,
}: {
  params: Promise<{ templateId: string }>;
}) {
  const { templateId } = await params;

  return <TemplateEditorClient templateId={Number(templateId)} />;
}
