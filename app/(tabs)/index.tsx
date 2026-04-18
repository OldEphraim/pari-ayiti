import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Banner } from '../../src/ui/components/Banner';
import { Card } from '../../src/ui/components/Card';
import { Screen } from '../../src/ui/components/Screen';
import { Text } from '../../src/ui/components/Text';
import { colors, radius, spacing } from '../../src/ui/theme';
import { useAppStore } from '../../src/state/useAppStore';
import { Match } from '../../src/db/matches';
import { formatHTGN } from '../../src/utils/money';
import { formatDate } from '../../src/utils/time';

const BET_PLACED_BANNER_MS = 3000;

export default function MatchesScreen() {
  const { t } = useTranslation();
  const matches = useAppStore((s) => s.matches);
  const balanceMinor = useAppStore((s) => s.balanceMinor);
  const language = useAppStore((s) => s.language);
  const isOnline = useAppStore((s) => s.isOnline);
  const lastFetchedAt = useAppStore((s) => s.lastFetchedAt);
  const recentlyPlacedAt = useAppStore((s) => s.recentlyPlacedAt);
  const clearRecentlyPlaced = useAppStore((s) => s.clearRecentlyPlaced);
  const refreshAll = useAppStore((s) => s.refreshAll);

  const [refreshing, setRefreshing] = useState(false);

  const upcoming = useMemo(
    () =>
      matches
        .filter((m) => m.status === 'upcoming' || m.status === 'live')
        .sort((a, b) => a.commence_time - b.commence_time),
    [matches],
  );

  useEffect(() => {
    if (recentlyPlacedAt === null) return;
    const timer = setTimeout(clearRecentlyPlaced, BET_PLACED_BANNER_MS);
    return () => clearTimeout(timer);
  }, [recentlyPlacedAt, clearRecentlyPlaced]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refreshAll();
    } finally {
      setRefreshing(false);
    }
  }, [refreshAll]);

  const openMatch = (matchId: string, selection: 'home' | 'draw' | 'away') => {
    router.push({
      pathname: '/match/[id]',
      params: { id: matchId, selection },
    });
  };

  return (
    <Screen padded={false}>
      <View style={styles.header}>
        <Text variant="h1">{t('tabs.matches')}</Text>
        <View style={styles.balanceBadge}>
          <Text variant="small" muted>
            {t('balance.label')}
          </Text>
          <Text variant="body">{formatHTGN(balanceMinor, language)}</Text>
        </View>
      </View>

      {recentlyPlacedAt !== null && (
        <Banner
          tone="info"
          message={t('bet.placed')}
          onDismiss={clearRecentlyPlaced}
        />
      )}

      {!isOnline && (
        <Banner
          tone="offline"
          message={t('matches.offline', {
            time: lastFetchedAt
              ? formatDate(lastFetchedAt, language)
              : '—',
          })}
        />
      )}

      <FlatList
        data={upcoming}
        keyExtractor={(m) => m.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <MatchCard
            match={item}
            language={language}
            onPickOutcome={(sel) => openMatch(item.id, sel)}
          />
        )}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text variant="body" muted>
              {t('matches.empty')}
            </Text>
          </View>
        }
      />
    </Screen>
  );
}

interface MatchCardProps {
  match: Match;
  language: 'ht' | 'fr';
  onPickOutcome: (selection: 'home' | 'draw' | 'away') => void;
}

function MatchCard({ match, language, onPickOutcome }: MatchCardProps) {
  const { t } = useTranslation();
  return (
    <Card>
      <View style={styles.cardInner}>
        <Text variant="body">
          {match.home_team} vs. {match.away_team}
        </Text>
        <Text variant="small" muted>
          {formatDate(match.commence_time, language)}
        </Text>
        <View style={styles.oddsRow}>
          <OddsButton
            label={t('bet.home')}
            value={match.odds_home}
            onPress={() => onPickOutcome('home')}
            disabled={match.odds_home === null}
          />
          <OddsButton
            label={t('bet.draw')}
            value={match.odds_draw}
            onPress={() => onPickOutcome('draw')}
            disabled={match.odds_draw === null}
          />
          <OddsButton
            label={t('bet.away')}
            value={match.odds_away}
            onPress={() => onPickOutcome('away')}
            disabled={match.odds_away === null}
          />
        </View>
      </View>
    </Card>
  );
}

interface OddsButtonProps {
  label: string;
  value: number | null;
  disabled?: boolean;
  onPress: () => void;
}

function OddsButton({ label, value, disabled, onPress }: OddsButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={disabled ? undefined : onPress}
      hitSlop={8}
      style={({ pressed }) => [
        styles.oddsBtn,
        pressed && !disabled && styles.oddsBtnPressed,
        disabled && styles.oddsBtnDisabled,
      ]}
    >
      <Text variant="small" muted>
        {label}
      </Text>
      <Text variant="body" style={styles.oddsValue}>
        {value !== null ? value.toFixed(2) : '—'}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    gap: spacing.md,
  },
  balanceBadge: {
    alignItems: 'flex-end',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  list: {
    padding: spacing.lg,
    gap: spacing.md,
    flexGrow: 1,
  },
  cardInner: {
    gap: spacing.sm,
  },
  oddsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  oddsBtn: {
    flex: 1,
    minHeight: 44,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  oddsBtnPressed: {
    opacity: 0.85,
    backgroundColor: colors.bg,
  },
  oddsBtnDisabled: {
    opacity: 0.5,
  },
  oddsValue: {
    fontWeight: '600',
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
});
