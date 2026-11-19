/** Tab navigator with the custom, persistent bottom navigation bar. */
import { Tabs } from 'expo-router/js-tabs';

import { BottomNav } from '@/components/chrome';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';

export default function TabLayout() {
  const t = useTheme();
  const { t: tr } = useT();
  return (
    <Tabs
      tabBar={(props) => <BottomNav {...props} />}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: t.palette.surface } }}>
      <Tabs.Screen name="index" options={{ title: tr('tab.today') }} />
      <Tabs.Screen name="analytics" options={{ title: tr('tab.analytics') }} />
      <Tabs.Screen name="explore" options={{ title: tr('tab.explore') }} />
    </Tabs>
  );
}
