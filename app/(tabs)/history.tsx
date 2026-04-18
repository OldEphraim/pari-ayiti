import { Alert, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Card } from '../../src/ui/components/Card';
import { Pill } from '../../src/ui/components/Pill';
import { Screen } from '../../src/ui/components/Screen';
import { Text } from '../../src/ui/components/Text';
import { PillColorKey, spacing } from '../../src/ui/theme';
import { useAppStore, runWorkersAndHydrate } from '../../src/state/useAppStore';
import { Bet, BetStatus } from '../../src/db/bets';
import { Match, markConcluded } from '../../src/db/matches';
import { getDb } from '../../src/db/client';
import { formatHTGN } from '../../src/utils/money';
import { formatDate } from '../../src/utils/time';

interface StatusDisplay {
  label: string;
  color: PillColorKey;
}

function useStatusDisplay(status: BetStatus): StatusDisplay {
  const { t } = useTranslation();
  switch (status) {
    case 'PENDING_SYNC':
      return { label: t('bet.pendingSync'), color: 'pendingSync' };
    case 'PENDING_SETTLEMENT':
      return { label: t('bet.pendingSettlement'), color: 'pendingSettlement' };
    case 'SETTLED_WON':
      return { label: t('bet.won'), color: 'won' };
    case 'SETTLED_LOST':
      return { label: t('bet.lost'), color: 'lost' };
    case 'VOID_REFUNDED':
      return { label: t('bet.voidRefunded'), color: 'void' };
  }
}

function selectionLabel(t: (k: string) => string, sel: Bet['selection']): string {
  if (sel === 'home') return t('bet.home');
  if (sel === 'draw') return t('bet.draw');
  return t('bet.away');
}

async function simulateResult(
  matchId: string,
  winner: 'home' | 'draw' | 'away',
): Promise<void> {
  const scores =
    winner === 'home' ? [2, 1] : winner === 'draw' ? [1, 1] : [1, 2];
  const db = await getDb();
  await markConcluded(db, matchId, scores[0], scores[1]);
  await runWorkersAndHydrate();
  Alert.alert(
    'DEV: sim result',
    `match ${matchId}\noutcome: ${winner}\nscores: ${scores[0]}-${scores[1]}`,
  );
}

function openSimSheet(matchId: string): void {
  Alert.alert('DEV: Simile rezilta', undefined, [
    { text: 'Lakay genyen', onPress: () => void simulateResult(matchId, 'home') },
    { text: 'Egalite', onPress: () => void simulateResult(matchId, 'draw') },
    { text: 'Deyò genyen', onPress: () => void simulateResult(matchId, 'away') },
    { text: 'Anile', style: 'cancel' },
  ]);
}

export default function HistoryScreen() {
  const { t } = useTranslation();
  const bets = useAppStore((s) => s.bets);
  const matches = useAppStore((s) => s.matches);
  const language = useAppStore((s) => s.language);

  const sorted = [...bets].sort((a, b) => b.placed_at - a.placed_at);
  const matchById = new Map<string, Match>(matches.map((m) => [m.id, m]));

  return (
    <Screen padded={false}>
      <View style={styles.header}>
        <Text variant="h1">{t('tabs.history')}</Text>
      </View>
      <FlatList
        data={sorted}
        keyExtractor={(b) => b.client_bet_id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <BetRow
            bet={item}
            match={matchById.get(item.match_id)}
            language={language}
          />
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text variant="body" muted>
              {t('history.empty')}
            </Text>
          </View>
        }
      />
    </Screen>
  );
}

interface BetRowProps {
  bet: Bet;
  match: Match | undefined;
  language: 'ht' | 'fr';
}

function BetRow({ bet, match, language }: BetRowProps) {
  const { t } = useTranslation();
  const display = useStatusDisplay(bet.status);
  const matchHeader = match
    ? `${match.home_team} vs. ${match.away_team}`
    : bet.match_id;
  const stakeLabel = `${t('bet.stake')}: ${formatHTGN(bet.stake_htgn, language)}`;
  const oddsLabel = `${selectionLabel(t, bet.selection)} · ${bet.odds_at_placement.toFixed(2)}`;
  return (
    <Card>
      <View style={styles.row}>
        <View style={styles.rowHeader}>
          <Text variant="body">{matchHeader}</Text>
          <Pill label={display.label} color={display.color} />
        </View>
        <Text variant="small" muted>
          {formatDate(bet.placed_at, language)}
        </Text>
        <Text variant="small">
          {oddsLabel} — {stakeLabel}
        </Text>
        {__DEV__ && bet.status === 'PENDING_SETTLEMENT' && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="DEV: Simile rezilta"
            hitSlop={8}
            style={styles.devBtn}
            onPress={() => openSimSheet(bet.match_id)}
          >
            <Text variant="small" style={styles.devBtnLabel}>
              DEV: Simile rezilta
            </Text>
          </Pressable>
        )}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  list: {
    padding: spacing.lg,
    gap: spacing.md,
    flexGrow: 1,
  },
  row: {
    gap: spacing.xs,
  },
  rowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  devBtn: {
    marginTop: spacing.xs,
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#E5E5E5',
  },
  devBtnLabel: {
    fontWeight: '600',
  },
});
