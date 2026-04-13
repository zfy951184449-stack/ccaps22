import { buildWorkspaceMetadata } from "@/features/navigation/metadata";
import { OrganizationWorkbench } from "@/features/organization/organization-workbench";
import { resolveOrganizationWorkbenchTab } from "@/features/organization/presentation";

export const metadata = buildWorkspaceMetadata("organization-workbench");

export default async function OrganizationWorkbenchPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const tabValue = Array.isArray(resolvedSearchParams?.tab)
    ? resolvedSearchParams.tab[0]
    : resolvedSearchParams?.tab;

  return (
    <OrganizationWorkbench
      initialTab={resolveOrganizationWorkbenchTab(tabValue)}
    />
  );
}
