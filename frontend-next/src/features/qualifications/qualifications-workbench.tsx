"use client";

import { useEffect, useState } from "react";
import {
  resolveQualificationWorkbenchTab,
  type QualificationWorkbenchTab,
} from "./presentation";
import { QualificationMatrixTab } from "./qualification-matrix-tab";
import { QualificationShortagesTab } from "./qualification-shortages-tab";
import { QualificationsListTab } from "./qualifications-list-tab";

export function QualificationsWorkbench({
  initialTab = "list",
}: {
  initialTab?: QualificationWorkbenchTab;
}) {
  const [activeTab, setActiveTab] = useState<QualificationWorkbenchTab>(
    resolveQualificationWorkbenchTab(initialTab),
  );

  useEffect(() => {
    const url = new URL(window.location.href);
    const currentTab = resolveQualificationWorkbenchTab(url.searchParams.get("tab"));

    if (currentTab !== activeTab) {
      if (activeTab === "list") {
        url.searchParams.delete("tab");
      } else {
        url.searchParams.set("tab", activeTab);
      }

      const nextUrl = `${url.pathname}${url.search}${url.hash}`;
      window.history.replaceState(null, "", nextUrl);
    }
  }, [activeTab]);

  switch (activeTab) {
    case "matrix":
      return (
        <QualificationMatrixTab
          activeTab={activeTab}
          onSelectTab={setActiveTab}
        />
      );
    case "shortages":
      return (
        <QualificationShortagesTab
          activeTab={activeTab}
          onSelectTab={setActiveTab}
        />
      );
    case "list":
    default:
      return (
        <QualificationsListTab
          activeTab={activeTab}
          onSelectTab={setActiveTab}
        />
      );
  }
}
