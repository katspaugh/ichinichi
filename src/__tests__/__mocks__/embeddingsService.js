const noop = () => {};
const noopService = {
  isReady: () => false,
  isLoading: () => false,
  embed: () => Promise.resolve([]),
  init: () => Promise.resolve(),
  dispose: noop,
};

module.exports = {
  getEmbeddingsService: () => noopService,
  resetEmbeddingsService: noop,
};
