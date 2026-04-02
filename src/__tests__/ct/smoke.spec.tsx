import { test, expect } from "@playwright/experimental-ct-react";
import { Button } from "../../components/Button";

test("Button renders", async ({ mount }) => {
  const component = await mount(<Button>Click me</Button>);
  await expect(component).toContainText("Click me");
});
