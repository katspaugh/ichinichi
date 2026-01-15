export const AppMode = {
  Local: "local",
  Cloud: "cloud",
} as const;

export type AppMode = (typeof AppMode)[keyof typeof AppMode];
