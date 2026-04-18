import { useCallback, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Card } from '../../src/ui/components/Card';
import { Screen } from '../../src/ui/components/Screen';
import { Text } from '../../src/ui/components/Text';
import { spacing } from '../../src/ui/theme';
import { getDb } from '../../src/db/client';
import { Match } from '../../src/db/matches';
import {
  getMatchesSnapshot,
  MatchesSnapshot,
} from '../../src/services/matchFetcher';
import { formatDate } from '../../src/utils/time';
import { currentLanguage } from '../../src/i18n';

export default function HomeScreen() {
  const { t } = useTranslation();
  const [snapshot, setSnapshot] = useState<MatchesSnapshot | null>(null);
  const lang = currentLanguage();

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        const db = await getDb();
        const s = await getMatchesSnapshot(db, 3);
        if (!cancelled) setSnapshot(s);
      })().catch((err: unknown) => {
        console.error('[home] snapshot failed:', err);
      });
      return () => {
        cancelled = true;
      };
    }, []),
  );

  return (
    <Screen padded={false}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
        <Text variant="h1">{t('tabs.matches')}</Text>

        {snapshot === null ? (
          <Text variant="body" muted>
            {t('matches.loading')}
          </Text>
        ) : snapshot.count === 0 ? (
          <Text variant="body" muted>
            {t('matches.empty')}
          </Text>
        ) : (
          <>
            <Card>
              <View style={{ gap: spacing.xs }}>
                <Text variant="small" muted>
                  DEV: diagnostic view (Phase 5) — the real list lands in Phase 6.
                </Text>
                <Text variant="body">
                  {snapshot.count} match
                </Text>
                <Text variant="small" muted>
                  last_fetched:{' '}
                  {snapshot.lastFetched && snapshot.lastFetched > 0
                    ? formatDate(snapshot.lastFetched, lang)
                    : 'fixture (never fetched)'}
                </Text>
              </View>
            </Card>

            {snapshot.first.map((m: Match) => (
              <Card key={m.id}>
                <View style={{ gap: spacing.xs }}>
                  <Text variant="body">
                    {m.home_team} vs {m.away_team}
                  </Text>
                  <Text variant="small" muted>
                    {formatDate(m.commence_time, lang)}
                  </Text>
                  <Text variant="small">
                    {t('bet.home')} {m.odds_home ?? '—'} · {t('bet.draw')}{' '}
                    {m.odds_draw ?? '—'} · {t('bet.away')} {m.odds_away ?? '—'}
                  </Text>
                  {m.status === 'concluded' && (
                    <Text variant="small" muted>
                      {m.home_score ?? '?'}–{m.away_score ?? '?'} · {m.status}
                    </Text>
                  )}
                </View>
              </Card>
            ))}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}
