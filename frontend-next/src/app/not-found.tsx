import { Button } from "@/design-system/primitives/button";
import { EmptyState } from "@/design-system/primitives/empty-state";
import Link from "next/link";

export default function NotFound() {
  return (
    <div className="p-8">
      <EmptyState
        action={
          <Link href="/dashboard">
            <Button>Back to dashboard</Button>
          </Link>
        }
        description="The route is not mapped inside frontend-next yet. Legacy CRA remains the default runtime while migration waves continue."
        eyebrow="Not found"
        title="This Precision Lab route does not exist"
      />
    </div>
  );
}
