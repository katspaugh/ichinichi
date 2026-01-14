/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

declare const __COMMIT_HASH__: string;

declare module "*.module.css" {
  const classes: { readonly [key: string]: string };
  export default classes;
}
