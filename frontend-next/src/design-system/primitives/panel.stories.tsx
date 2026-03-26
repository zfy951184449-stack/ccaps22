import type { Meta, StoryObj } from "@storybook/nextjs";
import { Badge } from "./badge";
import { Panel } from "./panel";

const meta = {
  title: "Primitives/Panel",
  component: Panel,
  tags: ["autodocs"],
  args: {
    eyebrow: "Precision Lab",
    title: "Panel title",
    description:
      "Panels are the default elevated surface for structured APS workbench content.",
    children: (
      <div className="text-sm leading-6 text-[var(--pl-text-secondary)]">
        Panel body content goes here.
      </div>
    ),
  },
} satisfies Meta<typeof Panel>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithAction: Story = {
  args: {
    action: <Badge tone="accent">active</Badge>,
  },
};
