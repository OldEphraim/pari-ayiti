import { ScrollView, StyleSheet, View } from 'react-native';
import { Banner } from '../../src/ui/components/Banner';
import { Button } from '../../src/ui/components/Button';
import { Card } from '../../src/ui/components/Card';
import { Pill } from '../../src/ui/components/Pill';
import { Screen } from '../../src/ui/components/Screen';
import { Text } from '../../src/ui/components/Text';
import { PillColorKey, spacing } from '../../src/ui/theme';
import { useState } from 'react';

const PILL_COLORS: { color: PillColorKey; label: string }[] = [
  { color: 'pendingSync', label: 'DEV: pendingSync' },
  { color: 'pendingSettlement', label: 'DEV: pendingSettlement' },
  { color: 'won', label: 'DEV: won' },
  { color: 'lost', label: 'DEV: lost' },
  { color: 'void', label: 'DEV: void' },
  { color: 'offline', label: 'DEV: offline' },
];

export default function GalleryScreen() {
  const [bannerOpen, setBannerOpen] = useState(true);

  return (
    <Screen padded={false}>
      {bannerOpen && (
        <Banner
          tone="offline"
          message="DEV: dismissible offline banner"
          onDismiss={() => setBannerOpen(false)}
        />
      )}
      <Banner tone="info" message="DEV: info banner (non-dismissible)" />
      <Banner tone="warn" message="DEV: warn banner" />

      <ScrollView contentContainerStyle={styles.content}>
        <Section title="DEV: Text variants">
          <Text variant="h1">DEV: h1 heading</Text>
          <Text variant="h2">DEV: h2 heading</Text>
          <Text variant="body">DEV: body text</Text>
          <Text variant="small">DEV: small text</Text>
          <Text variant="mono">DEV: mono text 12345</Text>
          <Text variant="body" muted>
            DEV: muted body text
          </Text>
        </Section>

        <Section title="DEV: Button variants">
          <Button label="DEV: primary" variant="primary" />
          <Button label="DEV: secondary" variant="secondary" />
          <Button label="DEV: ghost" variant="ghost" />
          <Button label="DEV: loading" variant="primary" loading />
          <Button label="DEV: disabled" variant="primary" disabled />
          <Button label="DEV: full width" variant="primary" fullWidth />
        </Section>

        <Section title="DEV: Pill colors">
          <View style={styles.pillRow}>
            {PILL_COLORS.map(({ color, label }) => (
              <Pill key={color} color={color} label={label} />
            ))}
          </View>
        </Section>

        <Section title="DEV: Card">
          <Card>
            <Text variant="h2">DEV: card title</Text>
            <Text variant="body" muted>
              DEV: card body content wrapped in a surface with padding and radius.
            </Text>
          </Card>
        </Section>

        <Section title="DEV: Screen">
          <Text variant="small" muted>
            DEV: this gallery is rendered inside a Screen component with padded=false
            at the root; sections use ScrollView padding.
          </Text>
        </Section>
      </ScrollView>
    </Screen>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text variant="h2" style={styles.sectionTitle}>
        {title}
      </Text>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.lg,
    gap: spacing.xl,
  },
  section: {
    gap: spacing.md,
  },
  sectionTitle: {},
  sectionBody: {
    gap: spacing.sm,
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
});
