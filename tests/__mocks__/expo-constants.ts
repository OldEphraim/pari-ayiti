// Test-only shim. Code paths that read Constants.expoConfig.extra see the
// defaults we'd have if the user's .env was empty: no API key, mock
// settlement provider, mock failures off. Tests override mockBackend
// behavior via the __setTestHooks seam rather than flipping env flags.

export default {
  expoConfig: {
    extra: {
      oddsApiKey: null,
      settlementProvider: 'mock',
      enableMockFailures: false,
    },
  },
};
