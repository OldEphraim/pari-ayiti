import { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { colors, spacing } from '../theme';
import { Text } from './Text';

export interface BannerProps {
  message: string;
  tone?: 'info' | 'warn' | 'offline';
  onDismiss?: () => void;
  dismissLabel?: string;
  right?: ReactNode;
}

export function Banner({
  message,
  tone = 'info',
  onDismiss,
  dismissLabel,
  right,
}: BannerProps) {
  return (
    <View style={[styles.banner, toneStyles[tone]]}>
      <Text variant="small" style={styles.message}>
        {message}
      </Text>
      <View style={styles.actions}>
        {right}
        {onDismiss && (
          <Pressable
            onPress={onDismiss}
            accessibilityRole="button"
            accessibilityLabel={dismissLabel ?? 'Dismiss'}
            hitSlop={8}
            style={styles.dismiss}
          >
            <Text variant="small" style={styles.dismissLabel}>
              ✕
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    width: '100%',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  message: {
    color: colors.surface,
    flex: 1,
    fontWeight: '500',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  dismiss: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dismissLabel: {
    color: colors.surface,
    fontWeight: '700',
  },
});

const toneStyles = StyleSheet.create({
  info: {
    backgroundColor: colors.primary,
  },
  warn: {
    backgroundColor: colors.accent,
  },
  offline: {
    backgroundColor: colors.offline,
  },
});
