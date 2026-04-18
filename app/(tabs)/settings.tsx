import { Link } from 'expo-router';
import { Alert, View } from 'react-native';
import { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Button } from '../../src/ui/components/Button';
import { Card } from '../../src/ui/components/Card';
import { Screen } from '../../src/ui/components/Screen';
import { Text } from '../../src/ui/components/Text';
import { spacing } from '../../src/ui/theme';
import { getDb } from '../../src/db/client';
import {
  applyLedgerEntry,
  getBalance,
  reconcileBalance,
} from '../../src/db/balance';
import { createBet } from '../../src/db/bets';
import { markConcluded, upsertMatches } from '../../src/db/matches';

export default function SettingsScreen() {
  const [running, setRunning] = useState(false);

  const runSmokeTest = async (): Promise<void> => {
    setRunning(true);
    try {
      const db = await getDb();
      const now = Math.floor(Date.now() / 1000);
      const matchId = `smoke-${Date.now()}`;
      const betId = uuidv4();
      const stake = 5000;
      const odds = 17.0;
      const payout = Math.floor(stake * odds);

      const before = await getBalance(db);

      await upsertMatches(db, [
        {
          id: matchId,
          sport_key: 'soccer_smoke',
          commence_time: now - 10800,
          home_team: 'Ayiti',
          away_team: 'Brezil',
          odds_home: odds,
          odds_draw: 8.0,
          odds_away: 1.15,
          status: 'upcoming',
          home_score: null,
          away_score: null,
          last_fetched: now,
        },
      ]);

      await db.transaction(async (tx) => {
        await createBet(tx, {
          client_bet_id: betId,
          match_id: matchId,
          selection: 'home',
          stake_htgn: stake,
          odds_at_placement: odds,
          potential_payout_htgn: payout,
          placed_at: now,
        });
        await applyLedgerEntry(tx, 'debit_stake', -stake, betId, now);
      });

      await markConcluded(db, matchId, 2, 1);
      await applyLedgerEntry(db, 'credit_winnings', payout, betId, now);

      const { balance: after, ledgerSum } = await reconcileBalance(db);

      Alert.alert(
        'DEV: smoke test',
        `before=${before}\nafter=${after}\nledgerSum=${ledgerSum}\nreconcile: OK`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      Alert.alert('DEV: smoke test FAILED', message);
    } finally {
      setRunning(false);
    }
  };

  return (
    <Screen>
      <Text variant="h1">Paramèt</Text>

      {__DEV__ && (
        <View style={{ marginTop: spacing.xl, gap: spacing.md }}>
          <Card>
            <Link href="/dev/gallery" accessibilityRole="link">
              <Text variant="body">DEV: Component gallery</Text>
            </Link>
          </Card>
          <Card>
            <View style={{ gap: spacing.sm }}>
              <Text variant="body">DEV: DB smoke test</Text>
              <Text variant="small" muted>
                Inserts a match, places a bet (tx + debit), concludes it,
                credits winnings, reconciles. Balance grows by one payout
                each run.
              </Text>
              <Button
                label={running ? 'DEV: running…' : 'DEV: Run DB smoke test'}
                variant="primary"
                loading={running}
                onPress={runSmokeTest}
              />
            </View>
          </Card>
        </View>
      )}
    </Screen>
  );
}
