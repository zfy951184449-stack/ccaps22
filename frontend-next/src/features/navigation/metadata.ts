import { workspaceRouteMap, type WorkspaceRouteKey } from "./workspace-routes";

export function buildWorkspaceMetadata(routeKey: WorkspaceRouteKey) {
  const route = workspaceRouteMap[routeKey];

  return {
    title: route.title,
    description: route.description,
  };
}
