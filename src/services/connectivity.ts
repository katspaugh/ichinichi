export type ConnectivityListener = (online: boolean) => void;

class ConnectivityService {
  private online: boolean =
    typeof navigator !== "undefined" ? navigator.onLine : true;
  private listeners = new Set<ConnectivityListener>();
  private started = false;

  private start() {
    if (this.started || typeof window === "undefined") return;
    this.started = true;
    window.addEventListener("online", this.handleOnline);
    window.addEventListener("offline", this.handleOffline);
  }

  private setOnline(online: boolean) {
    if (this.online === online) return;
    this.online = online;
    this.listeners.forEach((listener) => listener(online));
  }

  private handleOnline = () => {
    this.setOnline(true);
  };

  private handleOffline = () => {
    this.setOnline(false);
  };

  getOnline(): boolean {
    return this.online;
  }

  subscribe(listener: ConnectivityListener): () => void {
    this.start();
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}

export const connectivity = new ConnectivityService();
