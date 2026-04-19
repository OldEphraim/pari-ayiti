// Jest configuration for pari-ayiti.
//
// Tests run in Node (testEnvironment 'node'), not on the RN runtime. They
// exercise pure logic + DAOs via BetterSqliteDB. React Native native modules
// (expo-sqlite, expo-constants, AsyncStorage, NetInfo, …) must never be
// loaded by the test runner — we shim expo-sqlite and expo-constants via
// moduleNameMapper so any transitive import path resolves cleanly.
//
// We intentionally do NOT use the jest-expo preset: it assumes an RN
// runtime and transforms node_modules aggressively, which would collide
// with better-sqlite3's native binding.
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  moduleFileExtensions: ['ts', 'tsx', 'js', 'json'],
  testMatch: ['<rootDir>/tests/**/*.test.ts'],
  moduleNameMapper: {
    '^expo-sqlite$': '<rootDir>/tests/__mocks__/expo-sqlite.ts',
    '^expo-constants$': '<rootDir>/tests/__mocks__/expo-constants.ts',
    '^uuid$': '<rootDir>/tests/__mocks__/uuid.ts',
  },
};
