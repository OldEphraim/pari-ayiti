import 'react-native-get-random-values';
import { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { getDb } from '../src/db/client';
import { reconcileBalance } from '../src/db/balance';
import { initI18n } from '../src/i18n';
import { loadInitialMatches, refreshMatches } from '../src/services/matchFetcher';
import { subscribe } from '../src/services/connectivity';

export default function RootLayout() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      const db = await getDb();
      await Promise.all([
        initI18n(),
        (async () => {
          if (__DEV__) {
            const { balance, ledgerSum } = await reconcileBalance(db);
            console.log(
              `[DB] reconcile OK — balance=${balance} ledgerSum=${ledgerSum}`,
            );
          }
          await loadInitialMatches(db);
        })(),
      ]);
      setReady(true);
      // Fire-and-forget live refresh after first paint. If offline, no key,
      // or cache still fresh, this is a no-op.
      refreshMatches(db)
        .then((summary) => {
          if (summary.attempted) {
            console.log('[matches] refresh:', summary);
          }
        })
        .catch((err: unknown) => {
          console.warn('[matches] refresh threw:', err);
        });
    })().catch((err: unknown) => {
      console.error('[init] failed:', err);
      setReady(true);
    });

    const unsubscribe = subscribe((online) => {
      console.log('[connectivity]', online ? 'online' : 'offline');
    });
    return unsubscribe;
  }, []);

  if (!ready) return null;

  return (
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
    </Stack>
  );
}
