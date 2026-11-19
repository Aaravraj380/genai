/**
 * Explore — profile & settings entry, your habits, the template library,
 * and local data controls (backup, restore, sample data, reset).
 */
import { router } from 'expo-router';
import { useMemo } from 'react';
import { ScrollView, View } from 'react-native';

import { ProfileImage, TabHeader } from '@/components/chrome';
import { DataSection } from '@/components/DataSection';
import { AppText, Button, Card, Icon, Pill, PressableScale } from '@/components/primitives';
import { useToast } from '@/components/Toast';
import { SectionHeader } from '@/components/today';
import { describeFrequency } from '@/domain/format';
import { momentumStreak } from '@/domain/stats';
import { isCurrentlyPaused } from '@/domain/streaks';
import { TEMPLATES } from '@/domain/templates';
import { useTodayKey } from '@/hooks/useTodayContext';
import { useT } from '@/i18n';
import { haptic } from '@/services/haptics';
import { syncHabitReminder } from '@/services/notifications';
import { useHabitStore } from '@/store/useHabitStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import { habitIconGlyph } from '@/theme/icons';
import { useLayout, useTheme } from '@/theme/ThemeProvider';

export default function ExploreScreen() {
  const t = useTheme();
  const i18n = useT();
  const { t: tr, category, freqLabels } = i18n;
  const { gutter, maxContentWidth } = useLayout();
  const today = useTodayKey();
  const habits = useHabitStore((s) => s.habits);
  const logs = useHabitStore((s) => s.logs);
  const addFromTemplate = useHabitStore((s) => s.addFromTemplate);
  const weekStartsOn = useSettingsStore((s) => s.weekStartsOn);
  const profileName = useSettingsStore((s) => s.profileName);
  const [toast, flash] = useToast();

  const momentum = useMemo(() => momentumStreak(habits, logs, today), [habits, logs, today]);
  // Hide templates already added (by key, so it works whatever language they were added in).
  const available = TEMPLATES.filter(
    (tpl) => !habits.some((h) => h.templateKey === tpl.key || h.title === tpl.title || h.title === i18n.template(tpl).title),
  );

  return (
    <View style={{ flex: 1, backgroundColor: t.palette.surface }}>
      <TabHeader title={tr('tab.explore')} streak={momentum} />
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: gutter, paddingBottom: 32, gap: 24, width: '100%', maxWidth: maxContentWidth, alignSelf: 'center' }}>
        {/* ---- Profile & settings ---- */}
        <PressableScale accessibilityRole="button" onPress={() => router.push('/settings')}>
          <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <ProfileImage size={52} />
            <View style={{ flex: 1, gap: 2 }}>
              <AppText variant="headlineSm" numberOfLines={1}>
                {profileName ? tr('set.greeting', { name: profileName }) : tr('ex.settingsRow')}
              </AppText>
              <AppText variant="bodySm" color={t.palette.textSecondary} numberOfLines={2}>
                {tr('ex.settingsSub')}
              </AppText>
            </View>
            <Icon name="settings" size={22} color={t.palette.textSecondary} />
          </Card>
        </PressableScale>

        {/* ---- Your habits ---- */}
        <View style={{ gap: 10 }}>
          <SectionHeader icon="checklist" iconColor={t.palette.primary} title={tr('ex.yourHabits')} count={String(habits.length)} />
          {habits.length === 0 ? (
            <AppText variant="bodySm" color={t.palette.textSecondary}>
              {tr('ex.noHabits')}
            </AppText>
          ) : (
            habits.map((h) => {
              const paused = isCurrentlyPaused(h, today);
              return (
                <PressableScale key={h.id} accessibilityRole="button" onPress={() => router.push(`/habit/${h.id}`)}>
                  <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, opacity: paused ? 0.7 : 1 }}>
                    <View style={{ width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: `${h.color}22` }}>
                      <Icon name={habitIconGlyph[h.icon]} size={20} color={h.color} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <AppText variant="labelLg" numberOfLines={1}>
                        {h.title}
                      </AppText>
                      <AppText variant="bodySm" color={t.palette.textSecondary}>
                        {describeFrequency(h.frequency, freqLabels, weekStartsOn)}
                        {h.targetPerDay > 1 ? ` · ${tr('detail.perDay', { n: h.targetPerDay })}` : ''}
                      </AppText>
                    </View>
                    {paused ? (
                      <Pill tone="neutral">
                        <Icon name="pause" size={12} color={t.palette.textSecondary} />
                        <AppText variant="labelSm" color={t.palette.textSecondary}>
                          {tr('ex.paused')}
                        </AppText>
                      </Pill>
                    ) : null}
                    <Icon name="chevron-right" size={22} color={t.palette.textMuted} />
                  </Card>
                </PressableScale>
              );
            })
          )}
          <Button label={tr('ex.createCustom')} icon="add" tone="ghost" onPress={() => router.push('/habit/new')} />
        </View>

        {/* ---- Library ---- */}
        {available.length > 0 ? (
          <View style={{ gap: 10 }}>
            <SectionHeader icon="auto-awesome" iconColor={t.palette.tertiary} title={tr('ex.library')} />
            {available.map((raw) => {
              const tpl = i18n.template(raw);
              return (
                <Card key={tpl.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 }}>
                  <View style={{ width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: t.palette.surfaceContainer }}>
                    <Icon name={habitIconGlyph[tpl.icon]} size={20} color={tpl.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <AppText variant="labelLg" numberOfLines={1}>
                      {tpl.title}
                    </AppText>
                    <AppText variant="bodySm" color={t.palette.textSecondary}>
                      #{category(tpl.category)} · {describeFrequency(tpl.frequency, freqLabels, weekStartsOn)}
                    </AppText>
                  </View>
                  <PressableScale
                    accessibilityRole="button"
                    accessibilityLabel={tr('ex.addA11y', { title: tpl.title })}
                    scaleTo={0.9}
                    onPress={() => {
                      const h = addFromTemplate(tpl, today);
                      syncHabitReminder(h, today);
                      haptic.success();
                      flash(tr('ex.added', { title: tpl.title }));
                    }}
                    style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(16,185,129,0.14)' }}>
                    <Icon name="add" size={22} color={t.palette.primary} />
                  </PressableScale>
                </Card>
              );
            })}
          </View>
        ) : null}

        {/* ---- Data ---- */}
        <DataSection onToast={flash} />
      </ScrollView>
      {toast}
    </View>
  );
}
