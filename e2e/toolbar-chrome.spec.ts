import { expect, test } from "@playwright/test";
import { gotoDiagram } from "./helpers";

test("toolbar chrome is shared across actions and view tabs", async ({ page }) => {
  await gotoDiagram(page, "/organizational");

  const samples = await page.locator("[data-toolbar], [data-view-toggle]").evaluateAll((nodes) =>
    nodes.map((node) => {
      const style = getComputedStyle(node as HTMLElement);
      return {
        name:
          (node as HTMLElement).getAttribute("data-toolbar") ??
          (node as HTMLElement).getAttribute("data-view-toggle") ??
          "unknown",
        chrome: {
          display: style.display,
          gap: style.gap,
          padding: style.padding,
          borderStyle: style.borderStyle,
          fontSize: style.fontSize,
        },
      };
    }),
  );

  expect(samples.length).toBeGreaterThan(0);
  const baseline = samples[0].chrome;

  for (const sample of samples) {
    expect(sample.chrome, sample.name).toEqual(baseline);
  }
});
