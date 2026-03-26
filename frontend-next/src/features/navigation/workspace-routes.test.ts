import { resolveRouteFromPath } from "./workspace-routes";

describe("resolveRouteFromPath", () => {
  it("maps the root route to dashboard", () => {
    expect(resolveRouteFromPath("/")?.key).toBe("dashboard");
  });

  it("keeps dynamic V2 template routes on the same route definition", () => {
    expect(resolveRouteFromPath("/process-templates-v2/42")?.key).toBe(
      "process-templates-v2",
    );
  });
});
