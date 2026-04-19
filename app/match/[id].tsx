import { useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Button } from '../../src/ui/components/Button';
import { Card } from '../../src/ui/components/Card';
import { Screen } from '../../src/ui/components/Screen';
import { Text } from '../../src/ui/components/Text';
import { colors, radius, spacing } from '../../src/ui/theme';
import { useAppStore, BetError } from '../../src/state/useAppStore';
import { formatHTGN, toMinor } from '../../src/utils/money';
import { calculatePayout } from '../../src/utils/odds';
import { formatDate } from '../../src/utils/time';

type Selection = 'home' | 'draw' | 'away';

function parseSelection(value: unknown): Selection {
  if (value === 'home' || value === 'draw' || value === 'away') return value;
  return 'home';
}

export default function MatchDetailScreen() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ id: string; selection?: string }>();
  const matchId = typeof params.id === 'string' ? params.id : '';
  const initialSelection = parseSelection(params.selection);

  const match = useAppStore((s) => s.matches.find((m) => m.id === matchId));
  const balanceMinor = useAppStore((s) => s.balanceMinor);
  const language = useAppStore((s) => s.language);
  const placeBet = useAppStore((s) => s.placeBet);

  const [selection, setSelection] = useState<Selection>(initialSelection);
  const [stakeStr, setStakeStr] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  const oddsForSelection = useMemo(() => {
    if (!match) return null;
    if (selection === 'home') return match.odds_home;
    if (selection === 'draw') return match.odds_draw;
    return match.odds_away;
  }, [match, selection]);

  const parsedStake = useMemo(() => {
    if (stakeStr.trim() === '') return null;
    const normalized = stakeStr.replace(',', '.');
    const value = Number(normalized);
    if (!Number.isFinite(value) || value <= 0) return null;
    return value;
  }, [stakeStr]);

  const stakeMinor = useMemo(() => {
    if (parsedStake === null) return 0;
    try {
      return toMinor(parsedStake);
    } catch {
      return 0;
    }
  }, [parsedStake]);

  const payoutMinor = useMemo(() => {
    if (stakeMinor === 0 || oddsForSelection === null || oddsForSelection <= 1) {
      return null;
    }
    try {
      return calculatePayout(stakeMinor, oddsForSelection);
    } catch {
      return null;
    }
  }, [stakeMinor, oddsForSelection]);

  if (!match) {
    return (
      <Screen>
        <Text variant="body" muted>
          {t('matches.empty')}
        </Text>
      </Screen>
    );
  }

  const canConfirm =
    !submitting &&
    parsedStake !== null &&
    stakeMinor > 0 &&
    oddsForSelection !== null &&
    oddsForSelection > 1;

  const submit = async (overrideDailyLimit: boolean = false): Promise<void> => {
    if (!canConfirm || oddsForSelection === null || !match) return;
    setSubmitting(true);
    try {
      await placeBet({
        matchId: match.id,
        selection,
        stakeMinor,
        oddsAtPlacement: oddsForSelection,
        overrideDailyLimit,
      });
      router.back();
    } catch (err) {
      if (err instanceof BetError && err.code === 'insufficient_balance') {
        Alert.alert(t('bet.insufficientBalance'));
      } else if (err instanceof BetError && err.code === 'daily_limit_exceeded') {
        Alert.alert(t('bet.dailyLimitWarning'), undefined, [
          { text: t('common.no'), style: 'cancel' },
          { text: t('common.yes'), onPress: () => void submit(true) },
        ]);
      } else {
        Alert.alert(t('bet.genericError'));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const onConfirm = (): void => {
    if (!canConfirm) return;
    if (stakeMinor > balanceMinor) {
      Alert.alert(t('bet.insufficientBalance'));
      return;
    }
    if (stakeMinor > Math.floor(balanceMinor / 4)) {
      Alert.alert(t('bet.bigBetWarning'), undefined, [
        { text: t('common.no'), style: 'cancel' },
        { text: t('common.yes'), onPress: () => void submit(false) },
      ]);
      return;
    }
    void submit(false);
  };

  return (
    <Screen padded={false}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.content}>
          <Card>
            <View style={styles.headerCard}>
              <Text variant="h2">
                {match.home_team} vs. {match.away_team}
              </Text>
              <Text variant="small" muted>
                {formatDate(match.commence_time, language)}
              </Text>
            </View>
          </Card>

          <View style={styles.outcomeRow}>
            <OutcomeButton
              label={t('bet.home')}
              value={match.odds_home}
              active={selection === 'home'}
              onPress={() => setSelection('home')}
            />
            <OutcomeButton
              label={t('bet.draw')}
              value={match.odds_draw}
              active={selection === 'draw'}
              onPress={() => setSelection('draw')}
            />
            <OutcomeButton
              label={t('bet.away')}
              value={match.odds_away}
              active={selection === 'away'}
              onPress={() => setSelection('away')}
            />
          </View>

          <Card>
            <View style={styles.stakeCard}>
              <Text variant="small" muted>
                {t('bet.stake')}
              </Text>
              <TextInput
                value={stakeStr}
                onChangeText={setStakeStr}
                keyboardType="decimal-pad"
                placeholder="0"
                placeholderTextColor={colors.textMuted}
                style={styles.stakeInput}
                accessibilityLabel={t('bet.stake')}
              />
              <Text variant="small" muted>
                {t('balance.label')}: {formatHTGN(balanceMinor, language)}
              </Text>
            </View>
          </Card>

          <Card>
            <View style={styles.payoutCard}>
              <Text variant="small" muted>
                {t('bet.potentialPayout')}
              </Text>
              <Text variant="h2">
                {payoutMinor !== null
                  ? formatHTGN(payoutMinor, language)
                  : '—'}
              </Text>
            </View>
          </Card>

          <Button
            label={submitting ? '…' : t('bet.confirm')}
            variant="primary"
            onPress={onConfirm}
            disabled={!canConfirm}
            loading={submitting}
            fullWidth
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

interface OutcomeButtonProps {
  label: string;
  value: number | null;
  active: boolean;
  onPress: () => void;
}

function OutcomeButton({ label, value, active, onPress }: OutcomeButtonProps) {
  return (
    <View style={styles.outcomeWrap}>
      <Button
        label={`${label} · ${value !== null ? value.toFixed(2) : '—'}`}
        variant={active ? 'primary' : 'ghost'}
        onPress={onPress}
        disabled={value === null}
        fullWidth
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  headerCard: {
    gap: spacing.xs,
  },
  outcomeRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  outcomeWrap: {
    flex: 1,
  },
  stakeCard: {
    gap: spacing.xs,
  },
  stakeInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 20,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  payoutCard: {
    gap: spacing.xs,
  },
});
