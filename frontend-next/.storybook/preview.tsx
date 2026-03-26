import type { Preview } from "@storybook/nextjs";
import "../src/app/globals.css";

const preview: Preview = {
  parameters: {
    layout: "fullscreen",
    backgrounds: {
      default: "canvas",
      values: [
        { name: "canvas", value: "#edf2f7" },
        { name: "surface", value: "#f8fafc" },
      ],
    },
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
  },
  decorators: [
    (Story) => (
      <div className="min-h-screen bg-[var(--pl-canvas)] p-8 text-[var(--pl-text-primary)]">
        <Story />
      </div>
    ),
  ],
};

export default preview;
