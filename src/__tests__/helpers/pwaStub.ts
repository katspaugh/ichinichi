export function useRegisterSW() {
  return {
    needRefresh: [false],
    offlineReady: [false],
    updateServiceWorker: () => {},
  };
}
