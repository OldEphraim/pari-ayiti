import 'react-native-get-random-values';
import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { getDb } from '../src/db/client';
import { reconcileBalance } from '../src/db/balance';

export default function RootLayout() {
  useEffect(() => {
    (async () => {
      const db = await getDb();
      if (__DEV__) {
        const { balance, ledgerSum } = await reconcileBalance(db);
        console.log(
          `[DB] reconcile OK — balance=${balance} ledgerSum=${ledgerSum}`,
        );
      }
    })().catch((err: unknown) => {
      console.error('[DB] init/reconcile failed:', err);
    });
  }, []);

  return (
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
    </Stack>
  );
}
