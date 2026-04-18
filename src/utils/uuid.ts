// `react-native-get-random-values` is imported as the very first line of
// /app/_layout.tsx (see CLAUDE.md §3). Without that polyfill, uuid/v4
// throws at runtime on React Native because crypto.getRandomValues is
// undefined in the JS engine. If you see uuid throws, check that import.

export { v4 as uuid } from 'uuid';
