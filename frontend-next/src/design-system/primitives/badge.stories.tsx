import type { Meta, StoryObj } from "@storybook/nextjs";
import { Badge } from "./badge";

const meta = {
  title: "Primitives/Badge",
  component: Badge,
  tags: ["autodocs"],
  args: {
    children: "accent",
    tone: "accent",
  },
} satisfies Meta<typeof Badge>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Accent: Story = {};

export const Success: Story = {
  args: {
    children: "success",
    tone: "success",
  },
};
