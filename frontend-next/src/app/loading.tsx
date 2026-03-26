import { Loader } from "@/design-system/primitives/loader";
import { Panel } from "@/design-system/primitives/panel";

export default function Loading() {
  return (
    <div className="p-8">
      <Panel
        description="Route-level loading is explicit by default in the new shell."
        eyebrow="Loading"
        title="Preparing Precision Lab workspace"
      >
        <Loader label="Rendering workspace shell" />
      </Panel>
    </div>
  );
}
