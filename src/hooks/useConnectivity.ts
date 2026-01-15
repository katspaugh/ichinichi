import { useEffect, useState } from "react";
import { connectivity } from "../services/connectivity";

export function useConnectivity(): boolean {
  const [online, setOnline] = useState(connectivity.getOnline());

  useEffect(() => connectivity.subscribe(setOnline), []);

  return online;
}
