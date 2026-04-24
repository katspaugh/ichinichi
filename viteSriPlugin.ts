import { load } from "cheerio";
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import type { Plugin, ResolvedConfig } from "vite";

export function sriPlugin(): Plugin {
  let config: ResolvedConfig;
  const bundle: Record<
    string,
    { fileName: string; type: string; source?: string; code?: string }
  > = {};

  return {
    name: "local-sri-plugin",
    enforce: "post",
    apply: "build",
    configResolved(resolvedConfig) {
      config = resolvedConfig;
    },
    async writeBundle(options, outputBundle) {
      Object.entries(outputBundle).forEach(([key, value]) => {
        bundle[key] = value as (typeof bundle)[string];
      });

      const htmls = Object.values(bundle)
        .filter(
          (item) => item.type === "asset" && item.fileName.endsWith(".html"),
        )
        .map((item) => ({ name: item.fileName, source: item.source ?? "" }));

      await Promise.all(
        htmls.map(async ({ name, source: html }) => {
          const $ = load(String(html));
          const scripts = $("script").filter("[src]");

          const calculateIntegrity = async (element: {
            attribs: Record<string, string | undefined>;
          }) => {
            const attributeName = element.attribs.src ? "src" : "href";
            const resourceUrl = element.attribs[attributeName];
            if (!resourceUrl) return;

            const resourcePath =
              resourceUrl.indexOf(config.base) === 0
                ? resourceUrl.substring(config.base.length)
                : resourceUrl;

            const asset = Object.values(bundle).find(
              (item) => item.fileName === resourcePath,
            );
            let source: string | Buffer | undefined;

            if (asset) {
              source = asset.type === "asset" ? asset.source : asset.code;
            } else {
              try {
                source = readFileSync(
                  resolve(options.dir ?? config.build.outDir, resourcePath),
                );
              } catch {
                source = undefined;
              }
            }

            if (!source) return;

            element.attribs.integrity = `sha384-${createHash("sha384")
              .update(source)
              .digest()
              .toString("base64")}`;

            if (element.attribs.crossorigin === undefined) {
              element.attribs.crossorigin = "anonymous";
            }
          };

          await Promise.all(
            scripts.map(async (_i, script) => calculateIntegrity(script)),
          );

          writeFileSync(
            resolve(config.root, config.build.outDir, name),
            $.html(),
          );
        }),
      );
    },
  };
}
