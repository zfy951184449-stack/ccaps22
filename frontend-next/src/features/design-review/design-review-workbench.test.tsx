import { render, screen } from "@testing-library/react";
import { DesignReviewWorkbench } from "./design-review-workbench";

describe("DesignReviewWorkbench", () => {
  it("renders the main review sections and visible findings", () => {
    render(<DesignReviewWorkbench />);

    expect(
      screen.getByRole("heading", { name: "组件库与 UI 风格体检" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Token Baseline" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Primitive Gallery" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Pattern Gallery" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Issue Ledger" }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByText("Badge 与 StatusBadge 语义边界重叠").length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByText("业务页局部样式重新引入一批非 design-system 形态")
        .length,
    ).toBeGreaterThan(0);
  });
});
