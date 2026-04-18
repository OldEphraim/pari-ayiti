import { Link } from 'expo-router';
import { Screen } from '../../src/ui/components/Screen';
import { Text } from '../../src/ui/components/Text';
import { Card } from '../../src/ui/components/Card';
import { spacing } from '../../src/ui/theme';
import { View } from 'react-native';

export default function SettingsScreen() {
  return (
    <Screen>
      <Text variant="h1">Paramèt</Text>

      {__DEV__ && (
        <View style={{ marginTop: spacing.xl }}>
          <Card>
            <Link href="/dev/gallery" accessibilityRole="link">
              <Text variant="body">DEV: Component gallery</Text>
            </Link>
          </Card>
        </View>
      )}
    </Screen>
  );
}
