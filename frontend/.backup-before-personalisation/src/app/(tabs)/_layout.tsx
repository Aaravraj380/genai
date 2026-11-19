/** Tab navigator with the custom, persistent bottom navigation bar. */
import { Tabs } from 'expo-router/js-tabs';

import { BottomNav } from '@/components/chrome';
import { palette } from '@/theme/tokens';

export default function TabLayout() {
  return (
    <Tabs
      tabBar={(props) => <BottomNav {...props} />}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: palette.surface } }}>
      <Tabs.Screen name="index" options={{ title: 'Today' }} />
      <Tabs.Screen name="analytics" options={{ title: 'Analytics' }} />
      <Tabs.Screen name="explore" options={{ title: 'Explore' }} />
    </Tabs>
  );
}
