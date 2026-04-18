import {
  ActivityIndicator,
  Pressable,
  PressableProps,
  StyleSheet,
  View,
  ViewStyle,
  StyleProp,
} from 'react-native';
import { colors, radius, spacing } from '../theme';
import { Text } from './Text';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';

export interface ButtonProps extends Omit<PressableProps, 'style' | 'children'> {
  label: string;
  variant?: ButtonVariant;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Button({
  label,
  variant = 'primary',
  loading = false,
  disabled = false,
  fullWidth = false,
  style,
  onPress,
  accessibilityLabel,
  ...rest
}: ButtonProps) {
  const effectivelyDisabled = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: effectivelyDisabled, busy: loading }}
      disabled={effectivelyDisabled}
      onPress={effectivelyDisabled ? undefined : onPress}
      hitSlop={8}
      style={({ pressed }) => [
        styles.base,
        variantStyles[variant].container,
        fullWidth && styles.fullWidth,
        pressed && !effectivelyDisabled && styles.pressed,
        effectivelyDisabled && styles.disabled,
        style,
      ]}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={variantStyles[variant].label.color} />
      ) : (
        <Text variant="body" style={[styles.label, variantStyles[variant].label]}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 44,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  fullWidth: {
    alignSelf: 'stretch',
  },
  pressed: {
    opacity: 0.85,
  },
  disabled: {
    opacity: 0.5,
  },
  label: {
    fontWeight: '600',
  },
});

const variantStyles = {
  primary: StyleSheet.create({
    container: {
      backgroundColor: colors.primary,
    },
    label: {
      color: colors.surface,
    },
  }),
  secondary: StyleSheet.create({
    container: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.primary,
    },
    label: {
      color: colors.primary,
    },
  }),
  ghost: StyleSheet.create({
    container: {
      backgroundColor: 'transparent',
    },
    label: {
      color: colors.primary,
    },
  }),
} as const;
