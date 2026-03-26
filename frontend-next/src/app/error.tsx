"use client";

import { Button } from "@/design-system/primitives/button";
import { Panel } from "@/design-system/primitives/panel";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="zh-CN">
      <body className="m-0 min-h-screen bg-[var(--pl-canvas)] p-10">
        <Panel
          description="Wave 0 keeps global failure states explicit so future feature migrations inherit the same diagnostic pattern."
          eyebrow="Global error"
          title="frontend-next encountered an unexpected runtime error"
        >
          <div className="space-y-5">
            <p className="text-sm leading-6 text-[var(--pl-text-secondary)]">
              {error.message}
            </p>
            <Button onClick={reset}>Retry current route</Button>
          </div>
        </Panel>
      </body>
    </html>
  );
}
