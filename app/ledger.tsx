import { useCallback, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { Stack, useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Card } from '../src/ui/components/Card';
import { Screen } from '../src/ui/components/Screen';
import { Text } from '../src/ui/components/Text';
import { colors, spacing } from '../src/ui/theme';
import { useAppStore } from '../src/state/useAppStore';
import { getDb } from '../src/db/client';
import { LedgerKind, LedgerRow, listLedgerEntries } from '../src/db/balance';
import { formatHTGN } from '../src/utils/money';
import { formatDate } from '../src/utils/time';

function amountColor(kind: LedgerKind): string {
  switch (kind) {
    case 'credit_winnings':
      return colors.won;
    case 'debit_stake':
      return colors.textMuted;
    case 'refund_void':
      return colors.pendingSync;
    case 'initial_grant':
      return colors.text;
  }
}

function signedAmount(row: LedgerRow, language: 'ht' | 'fr'): string {
  const sign = row.amount_htgn_minor > 0 ? '+' : '';
  return `${sign}${formatHTGN(row.amount_htgn_minor, language)}`;
}

export default function LedgerScreen() {
  const { t } = useTranslation();
  const balanceMinor = useAppStore((s) => s.balanceMinor);
  const language = useAppStore((s) => s.language);
  const [rows, setRows] = useState<LedgerRow[] | null>(null);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        const db = await getDb();
        const entries = await listLedgerEntries(db);
        if (!cancelled) setRows(entries);
      })().catch((err: unknown) => {
        console.error('[ledger] load failed:', err);
      });
      return () => {
        cancelled = true;
      };
    }, []),
  );

  return (
    <Screen padded={false}>
      <Stack.Screen options={{ title: t('settings.viewLedger') }} />
      <View style={styles.header}>
        <Card>
          <View style={styles.headerInner}>
            <Text variant="small" muted>
              {t('ledger.header')}
            </Text>
            <Text variant="h1">{formatHTGN(balanceMinor, language)}</Text>
          </View>
        </Card>
      </View>
      <FlatList
        data={rows ?? []}
        keyExtractor={(r) => String(r.id)}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <LedgerRowView row={item} language={language} />
        )}
        ListEmptyComponent={
          rows === null ? null : (
            <View style={styles.empty}>
              <Text variant="body" muted>
                {t('ledger.empty')}
              </Text>
            </View>
          )
        }
      />
    </Screen>
  );
}

interface RowProps {
  row: LedgerRow;
  language: 'ht' | 'fr';
}

function LedgerRowView({ row, language }: RowProps) {
  const { t } = useTranslation();
  const color = amountColor(row.kind);
  const matchLine =
    row.match_home_team && row.match_away_team
      ? `${row.match_home_team} vs. ${row.match_away_team}`
      : null;
  return (
    <Card>
      <View style={styles.rowInner}>
        <View style={styles.rowTop}>
          <Text variant="body">{t(`ledger.kinds.${row.kind}`)}</Text>
          <Text variant="body" style={{ color, fontWeight: '600' }}>
            {signedAmount(row, language)}
          </Text>
        </View>
        <Text variant="small" muted>
          {formatDate(row.created_at, language)}
        </Text>
        {matchLine && (
          <Text variant="small" muted>
            — {matchLine}
          </Text>
        )}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  header: {
    padding: spacing.lg,
    paddingBottom: 0,
  },
  headerInner: {
    gap: spacing.xs,
  },
  list: {
    padding: spacing.lg,
    gap: spacing.md,
    flexGrow: 1,
  },
  rowInner: {
    gap: spacing.xs,
  },
  rowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
});
