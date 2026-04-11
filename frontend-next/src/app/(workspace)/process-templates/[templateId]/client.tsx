/* ── Template Editor Client Wrapper ──────────────────────────────────
 *
 * "use client" boundary for the template editor.
 */

"use client";

import { TemplateEditor } from "@/features/process-template/components/template-editor";

export function TemplateEditorClient({ templateId }: { templateId: number }) {
  return <TemplateEditor templateId={templateId} />;
}
