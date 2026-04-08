/* ── Template Gantt Page ──────────────────────────────────────────
 *
 * Dynamic route: /process-templates-v2/[templateId]
 * Loads a single template and renders the Gantt editor.
 */

"use client";

import React from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ProcessTemplateGantt } from "@/features/process-template-gantt";
import * as api from "@/services/process-template-api";

export default function ProcessTemplateV2EditorPage() {
  const params = useParams<{ templateId: string }>();
  const router = useRouter();
  const templateId = Number(params.templateId);

  const { data: template, isLoading, error } = useQuery({
    queryKey: ["template", templateId],
    queryFn: () => api.getTemplate(templateId),
    enabled: !isNaN(templateId),
  });

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center bg-[var(--surface)]">
        <span className="text-sm text-[var(--text-tertiary)]">加载模版…</span>
      </div>
    );
  }

  if (error || !template) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-[var(--surface)]">
        <span className="text-sm text-[var(--danger)]">
          模版加载失败
        </span>
        <button
          onClick={() => router.push("/process-templates-v2")}
          className="rounded-md bg-[var(--accent)] px-4 py-1.5 text-sm text-white transition-colors hover:bg-[var(--accent-strong)]"
        >
          返回列表
        </button>
      </div>
    );
  }

  return (
    <ProcessTemplateGantt
      mode="template"
      template={template}
      onBack={() => router.push("/process-templates-v2")}
    />
  );
}
