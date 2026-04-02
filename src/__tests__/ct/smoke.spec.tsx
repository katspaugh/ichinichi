import { test, expect } from "@playwright/experimental-ct-react";
import { Calendar } from "../../components/Calendar";

test("Calendar renders without crashing", async ({ mount }) => {
  const component = await mount(
    <Calendar year={2024} hasNote={() => false} />,
  );
  await expect(component).toBeVisible();
});
