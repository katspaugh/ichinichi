import { load } from "cheerio";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer, type Plugin } from "vite";

export function prerenderCalendarPlugin(): Plugin {
  return {
    name: "prerender-calendar",
    apply: "build",
    enforce: "post",
    transformIndexHtml: {
      order: "post",
      async handler(html) {
        // Reuse vite.config.ts so CSS module class names match the build's
        // generateScopedName output. `apply: "build"` plugins (this one,
        // sriPlugin) are inactive in middlewareMode so there's no recursion.
        const vite = await createServer({
          root: process.cwd(),
          logLevel: "error",
          server: { middlewareMode: true },
          appType: "custom",
        });

        try {
          const { AppShell } = await vite.ssrLoadModule(
            "/src/components/AppShell/AppShell.tsx",
          );

          const now = new Date();
          const year = now.getFullYear();
          const today = [
            String(year),
            String(now.getMonth() + 1).padStart(2, "0"),
            String(now.getDate()).padStart(2, "0"),
          ].join("-");

          const shellHtml = renderToStaticMarkup(
            React.createElement(AppShell, { year, now }),
          );

          const $ = load(html);
          $("#root")
            .attr("data-ssg-calendar", "true")
            .attr("data-ssg-year", String(year))
            .attr("data-ssg-today", today)
            .html(shellHtml);
          return $.html();
        } finally {
          await vite.close();
        }
      },
    },
  };
}
