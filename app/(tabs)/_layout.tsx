import { Tabs } from 'expo-router';

export default function TabsLayout() {
  return (
    <Tabs>
      <Tabs.Screen name="index" options={{ title: 'Pari Ayiti' }} />
      <Tabs.Screen name="settings" options={{ title: 'Paramèt' }} />
    </Tabs>
  );
}
