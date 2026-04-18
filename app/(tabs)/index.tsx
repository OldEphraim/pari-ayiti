import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Text } from '../../src/ui/components/Text';

export default function HomeScreen() {
  const { t } = useTranslation();
  return (
    <View style={styles.container}>
      <Text variant="h1">{t('app.title')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FAFAF7',
  },
});
