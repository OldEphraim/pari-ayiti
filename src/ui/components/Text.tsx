import { Text as RNText, TextProps as RNTextProps, StyleSheet } from 'react-native';
import { colors, type, TextVariant } from '../theme';

export interface TextProps extends RNTextProps {
  variant?: TextVariant;
  muted?: boolean;
}

export function Text({ variant = 'body', muted, style, children, ...rest }: TextProps) {
  return (
    <RNText
      style={[
        styles.base,
        type[variant],
        muted && styles.muted,
        style,
      ]}
      {...rest}
    >
      {children}
    </RNText>
  );
}

const styles = StyleSheet.create({
  base: {
    color: colors.text,
  },
  muted: {
    color: colors.textMuted,
  },
});
