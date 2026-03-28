import { buildWorkspaceMetadata } from "@/features/navigation/metadata";
import { redirect } from "next/navigation";

export const metadata = buildWorkspaceMetadata("qualification-matrix");

export default function QualificationMatrixPage() {
  redirect("/qualifications?tab=matrix");
}
