import 'react-native-get-random-values';
import { useEffect, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { Stack } from 'expo-router';
import { getDb } from '../src/db/client';
import { reconcileBalance } from '../src/db/balance';
import { initI18n } from '../src/i18n';
import { loadInitialMatches, refreshMatches } from '../src/services/matchFetcher';
import {
  currentlyOnline,
  subscribe as subscribeConnectivity,
} from '../src/services/connectivity';
import {
  runWorkersAndHydrate,
  useAppStore,
} from '../src/state/useAppStore';

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
      await useAppStore.getState().hydrate();
      setReady(true);
      // Drain anything pending from a previous session; safe no-op if nothing
      // queued.
      runWorkersAndHydrate().catch((err: unknown) => {
        console.warn('[boot] runWorkersAndHydrate failed:', err);
      });
      // Fire-and-forget live refresh; hydrates the store after the fetch.
      refreshMatches(db)
        .then((summary) => {
          if (summary.attempted) {
            console.log('[matches] refresh:', summary);
            return useAppStore.getState().refreshAll();
          }
          return undefined;
        })
        .catch((err: unknown) => {
          console.warn('[matches] refresh threw:', err);
        });
    })().catch((err: unknown) => {
      console.error('[init] failed:', err);
      setReady(true);
    });

    // Workers fire on offline→online transitions and on every time the app
    // comes to the foreground.
    let wasOnline = currentlyOnline();
    const unsubscribeConn = subscribeConnectivity((online) => {
      console.log('[connectivity]', online ? 'online' : 'offline');
      if (!wasOnline && online) {
        runWorkersAndHydrate().catch((err: unknown) => {
          console.warn('[reconnect] runWorkersAndHydrate failed:', err);
        });
      }
      wasOnline = online;
    });

    const onAppStateChange = (state: AppStateStatus): void => {
      if (state === 'active') {
        runWorkersAndHydrate().catch((err: unknown) => {
          console.warn('[foreground] runWorkersAndHydrate failed:', err);
        });
      }
    };
    const appStateSub = AppState.addEventListener('change', onAppStateChange);

    return () => {
      unsubscribeConn();
      appStateSub.remove();
    };
  }, []);

  if (!ready) return null;

  return (
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
    </Stack>
  );
}
