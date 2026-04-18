import { StyleSheet, View } from 'react-native';
import { colors, radius, spacing, PillColorKey } from '../theme';
import { Text } from './Text';

export interface PillProps {
  label: string;
  color: PillColorKey;
}

export function Pill({ label, color }: PillProps) {
  return (
    <View style={[styles.pill, { backgroundColor: colors[color] }]}>
      <Text variant="small" style={styles.label}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
  },
  label: {
    color: colors.surface,
    fontWeight: '600',
  },
});
