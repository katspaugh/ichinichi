import type { Clock } from "../domain/runtime/clock";
import type { Connectivity } from "../domain/runtime/connectivity";
import { connectivity } from "../services/connectivity";

export const runtimeConnectivity: Connectivity = {
  isOnline: () => connectivity.getOnline(),
};

export const runtimeClock: Clock = {
  now: () => new Date(),
};
