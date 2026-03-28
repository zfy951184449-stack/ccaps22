import { buildWorkspaceMetadata } from "@/features/navigation/metadata";
import { QualificationsWorkbench } from "@/features/qualifications/qualifications-workbench";
import { resolveQualificationWorkbenchTab } from "@/features/qualifications/presentation";

export const metadata = buildWorkspaceMetadata("qualifications");

export default async function QualificationsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const tabValue = Array.isArray(resolvedSearchParams?.tab)
    ? resolvedSearchParams.tab[0]
    : resolvedSearchParams?.tab;

  return (
    <QualificationsWorkbench
      initialTab={resolveQualificationWorkbenchTab(tabValue)}
    />
  );
}
