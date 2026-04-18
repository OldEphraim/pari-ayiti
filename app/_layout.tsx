import 'react-native-get-random-values';
import { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { getDb } from '../src/db/client';
import { reconcileBalance } from '../src/db/balance';
import { initI18n } from '../src/i18n';

export default function RootLayout() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      await Promise.all([
        initI18n(),
        (async () => {
          const db = await getDb();
          if (__DEV__) {
            const { balance, ledgerSum } = await reconcileBalance(db);
            console.log(
              `[DB] reconcile OK — balance=${balance} ledgerSum=${ledgerSum}`,
            );
          }
        })(),
      ]);
      setReady(true);
    })().catch((err: unknown) => {
      console.error('[init] failed:', err);
      // Fall through anyway — better to render a partially-broken screen
      // than a blank one on a non-fatal init error.
      setReady(true);
    });
  }, []);

  if (!ready) {
    return null;
  }

  return (
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
    </Stack>
  );
}
