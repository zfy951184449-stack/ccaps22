import type { Meta, StoryObj } from "@storybook/nextjs";
import { StatCard } from "./stat-card";

const meta = {
  title: "Patterns/StatCard",
  component: StatCard,
  tags: ["autodocs"],
  args: {
    label: "Wave 0",
    tone: "accent",
    value: "Shell ready",
  },
} satisfies Meta<typeof StatCard>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
