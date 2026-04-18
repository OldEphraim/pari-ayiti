import { Link } from 'expo-router';
import { Alert, ScrollView, View } from 'react-native';
import { useState } from 'react';
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
import { formatHTGN } from '../../src/utils/money';
import { calculatePayout } from '../../src/utils/odds';
import { uuid } from '../../src/utils/uuid';
import { formatDate, now as nowSeconds } from '../../src/utils/time';

export default function SettingsScreen() {
  const [runningSmoke, setRunningSmoke] = useState(false);

  const runSmokeTest = async (): Promise<void> => {
    setRunningSmoke(true);
    try {
      const db = await getDb();
      const now = nowSeconds();
      const matchId = `smoke-${Date.now()}`;
      const betId = uuid();
      const stake = 5000;
      const odds = 17.0;
      const payout = calculatePayout(stake, odds);

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
      setRunningSmoke(false);
    }
  };

  const runUtilsCheck = (): void => {
    try {
      const sampleMinor = 125050;
      const moneyLine = `formatHTGN(${sampleMinor}) → ${formatHTGN(sampleMinor, 'ht')}`;

      // Haiti vs. Brazil, plausible Group C kickoff: 2026-06-13 20:00 UTC.
      const kickoffTs = Math.floor(
        Date.UTC(2026, 5, 13, 20, 0, 0) / 1000,
      );
      const dateLine = `formatDate(${kickoffTs}) → ${formatDate(kickoffTs, 'ht')}`;

      const uuidLine = `uuid() → ${uuid()}`;

      const stakeMinor = 5000;
      const odds = 17.0;
      const payout = calculatePayout(stakeMinor, odds);
      const payoutLine = `calculatePayout(${stakeMinor}, ${odds}) → ${payout}`;

      Alert.alert(
        'DEV: utils check',
        [moneyLine, dateLine, uuidLine, payoutLine].join('\n\n'),
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      Alert.alert('DEV: utils check FAILED', message);
    }
  };

  return (
    <Screen padded={false}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg }}>
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
                  label={runningSmoke ? 'DEV: running…' : 'DEV: Run DB smoke test'}
                  variant="primary"
                  loading={runningSmoke}
                  onPress={runSmokeTest}
                />
              </View>
            </Card>

            <Card>
              <View style={{ gap: spacing.sm }}>
                <Text variant="body">DEV: Utils check</Text>
                <Text variant="small" muted>
                  Exercises money / odds / uuid / time helpers and shows the
                  output in an alert for visual verification.
                </Text>
                <Button
                  label="DEV: Run utils check"
                  variant="secondary"
                  onPress={runUtilsCheck}
                />
              </View>
            </Card>
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}
