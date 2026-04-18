// Layers .env values onto the static app.json config so runtime code
// can read them via `Constants.expoConfig.extra`. Values are read at
// bundle time (Metro reads process.env), so changes to .env require
// a Metro restart to propagate.
module.exports = ({ config }) => ({
  ...config,
  extra: {
    ...config.extra,
    oddsApiKey: process.env.ODDS_API_KEY ?? null,
    settlementProvider: process.env.SETTLEMENT_PROVIDER ?? 'mock',
    enableMockFailures: process.env.ENABLE_MOCK_FAILURES === 'true',
  },
});
