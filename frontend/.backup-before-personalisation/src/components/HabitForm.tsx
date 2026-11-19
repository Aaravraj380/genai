/**
 * Create / edit form — mirrors the Stitch "New Habit" sheet.
 */
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Switch, TextInput, View, type ScrollViewInstance } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { timesPerWeek } from '@/domain/format';
import type { Frequency, Habit, HabitIcon, Weekday } from '@/domain/types';
import { haptic } from '@/services/haptics';
import type { HabitInput } from '@/store/useHabitStore';
import { categories, habitIconGlyph, iconPresets } from '@/theme/icons';
import { useLayout, useTheme } from '@/theme/ThemeProvider';

import { SegmentedControl } from './animated';
import { formatTime } from './today';
import { AppText, Button, Card, Icon, IconButton, PressableScale } from './primitives';

type FreqType = Frequency['type'];
const FREQ_OPTIONS: { value: FreqType; label: string }[] = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekdays', label: 'Weekdays' },
  { value: 'weekends', label: 'Weekends' },
  { value: 'custom', label: 'Custom' },
];
const WEEK: { d: Weekday; l: string }[] = [
  { d: 1, l: 'M' },
  { d: 2, l: 'T' },
  { d: 3, l: 'W' },
  { d: 4, l: 'T' },
  { d: 5, l: 'F' },
  { d: 6, l: 'S' },
  { d: 0, l: 'S' },
];
const WEEK_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MAX_TITLE = 60;

export function HabitForm({
  initial,
  mode,
  onSubmit,
  onDelete,
}: {
  initial?: Habit;
  mode: 'create' | 'edit';
  onSubmit: (input: HabitInput) => void;
  onDelete?: () => void;
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { gutter, maxContentWidth, isCompact } = useLayout();

  const [title, setTitle] = useState(initial?.title ?? '');
  const [icon, setIcon] = useState<HabitIcon>(initial?.icon ?? 'reading');
  const [category, setCategory] = useState(initial?.category ?? 'Learning');
  const [note, setNote] = useState(initial?.note ?? '');
  const [freqType, setFreqType] = useState<FreqType>(initial?.frequency.type ?? 'daily');
  const [customDays, setCustomDays] = useState<Weekday[]>(
    initial?.frequency.type === 'custom' ? initial.frequency.days : [1, 3, 5],
  );
  const [target, setTarget] = useState(initial?.targetPerDay ?? 1);
  const [reminderOn, setReminderOn] = useState(initial?.reminder?.enabled ?? true);
  const [minutes, setMinutes] = useState(initial?.reminder ? initial.reminder.hour * 60 + initial.reminder.minute : 8 * 60 + 30);
  const [color, setColor] = useState(initial?.color ?? t.habitColors[0]);
  const [touched, setTouched] = useState(false);
  const scrollRef = useRef<ScrollViewInstance>(null);

  const frequency: Frequency = freqType === 'custom' ? { type: 'custom', days: customDays } : { type: freqType };
  const titleError = touched && title.trim().length === 0 ? 'Give your habit a name' : null;
  const daysError = freqType === 'custom' && customDays.length === 0 ? 'Pick at least one day' : null;
  const valid = title.trim().length > 0 && !daysError;

  const submit = () => {
    setTouched(true);
    if (!valid) {
      haptic.warning();
      // Bring the first error into view.
      scrollRef.current?.scrollTo({ y: 0, animated: true });
      return;
    }
    haptic.success();
    onSubmit({
      title: title.trim().slice(0, MAX_TITLE),
      icon,
      category,
      note: note.trim() || undefined,
      color,
      frequency,
      targetPerDay: target,
      reminder: { enabled: reminderOn, hour: Math.floor(minutes / 60), minute: minutes % 60 },
    });
  };

  const shiftTime = (delta: number) => setMinutes((m) => (m + delta + 24 * 60) % (24 * 60));
  const perWeek = timesPerWeek(frequency);

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        ref={scrollRef}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: gutter, paddingBottom: insets.bottom + 32, width: '100%', maxWidth: maxContentWidth, alignSelf: 'center' }}>
        <View
          style={{
            backgroundColor: t.palette.surfaceElevated,
            borderRadius: t.radii.xl,
            borderWidth: 1,
            borderColor: t.palette.ghostBorder,
            padding: isCompact ? 14 : 20,
            gap: 22,
          }}>
          <View style={{ alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: t.palette.borderSubtle }} />

          {/* Header row */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <PressableScale accessibilityRole="button" onPress={() => router.back()} style={{ paddingVertical: 8 }}>
              <AppText variant="labelLg" color={t.palette.textSecondary}>
                Cancel
              </AppText>
            </PressableScale>
            <View style={{ alignItems: 'center', flexShrink: 1 }}>
              <AppText variant="headlineSm" numberOfLines={1} adjustsFontSizeToFit accessibilityRole="header">
                {mode === 'create' ? 'Create New Habit' : 'Edit Habit'}
              </AppText>
              <AppText variant="labelSm" color={t.palette.primary} uppercase>
                Step 1 of 1
              </AppText>
            </View>
            <Button label={mode === 'create' ? 'Save' : 'Save'} size="sm" onPress={submit} disabled={!valid && touched} />
          </View>

          {/* Name */}
          <Field label="Habit Name" error={titleError}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: t.palette.surfaceContainer,
                borderRadius: t.radii.md,
                borderWidth: 1,
                borderColor: titleError ? t.palette.error : 'transparent',
                paddingHorizontal: 14,
              }}>
              <TextInput
                value={title}
                onChangeText={setTitle}
                onBlur={() => setTouched(true)}
                placeholder="e.g. Read 20 pages"
                placeholderTextColor={t.palette.textMuted}
                maxLength={MAX_TITLE}
                returnKeyType="done"
                accessibilityLabel="Habit name"
                style={[t.typography.bodyLg, { flex: 1, color: t.palette.textPrimary, paddingVertical: 14, outlineStyle: 'none' } as object]}
              />
              {title ? (
                <PressableScale accessibilityLabel="Clear name" onPress={() => setTitle('')} hitSlop={10}>
                  <Icon name="cancel" size={20} color={t.palette.textSecondary} />
                </PressableScale>
              ) : null}
            </View>
          </Field>

          {/* Icons */}
          <Field label="Quick icon presets" small>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {iconPresets.map((p) => {
                const sel = p.icon === icon;
                return (
                  <Chip key={p.icon} selected={sel} onPress={() => setIcon(p.icon)} label={p.label} icon={habitIconGlyph[p.icon]} />
                );
              })}
            </ScrollView>
          </Field>

          {/* Category */}
          <Field label="Category tag" small>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {categories.map((c) => (
                <Chip key={c} selected={c === category} onPress={() => setCategory(c)} label={`#${c}`} />
              ))}
            </View>
          </Field>

          {/* Frequency */}
          <Field
            label="Frequency Cadence"
            right={
              <AppText variant="labelSm" color={t.palette.primary}>
                {perWeek === 7 ? 'Unbroken Chain' : `${perWeek}× per week`}
              </AppText>
            }
            error={daysError}>
            <SegmentedControl options={FREQ_OPTIONS} value={freqType} onChange={setFreqType} />
            {freqType === 'custom' ? (
              <Animated.View entering={FadeIn} exiting={FadeOut} layout={LinearTransition} style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 }}>
                {WEEK.map(({ d, l }) => {
                  const on = customDays.includes(d);
                  return (
                    <PressableScale
                      key={d}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: on }}
                      accessibilityLabel={WEEK_NAMES[d]}
                      onPress={() => {
                        haptic.tap();
                        setCustomDays((cur) => (on ? cur.filter((x) => x !== d) : [...cur, d]));
                      }}
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 20,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: on ? t.palette.primary : t.palette.surfaceContainer,
                      }}>
                      <AppText variant="labelLg" color={on ? t.palette.onPrimary : t.palette.textSecondary}>
                        {l}
                      </AppText>
                    </PressableScale>
                  );
                })}
              </Animated.View>
            ) : null}
          </Field>

          {/* Target repetition */}
          <Card level={2} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <AppText variant="labelLg">Target Repetition</AppText>
              <AppText variant="bodySm" color={t.palette.textSecondary}>
                {target} time{target > 1 ? 's' : ''} per day
              </AppText>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: t.palette.surfaceBase, borderRadius: 999, padding: 5 }}>
              <IconButton icon="remove" label="Decrease target" size={38} onPress={() => setTarget((v) => Math.max(1, v - 1))} />
              <AppText variant="headlineSm" color={t.palette.primary} tabular style={{ minWidth: 22, textAlign: 'center' }}>
                {target}
              </AppText>
              <IconButton icon="add" label="Increase target" size={38} onPress={() => setTarget((v) => Math.min(20, v + 1))} />
            </View>
          </Card>

          {/* Reminder */}
          <Card level={2} style={{ gap: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: t.palette.surfaceContainerHigh }}>
                <Icon name="alarm" size={22} color={t.palette.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <AppText variant="labelLg">Smart Reminder</AppText>
                <AppText variant="headlineSm" color={reminderOn ? t.palette.primary : t.palette.textMuted} tabular>
                  {formatTime(Math.floor(minutes / 60), minutes % 60)}
                </AppText>
              </View>
              <Switch
                value={reminderOn}
                onValueChange={(v) => {
                  haptic.tap();
                  setReminderOn(v);
                }}
                accessibilityLabel="Smart reminder"
                trackColor={{ false: t.palette.surfaceContainerHighest, true: t.palette.primary }}
                thumbColor={reminderOn ? t.palette.surfaceBase : t.palette.textSecondary}
                {...(Platform.OS === 'web' ? ({ activeThumbColor: t.palette.surfaceBase } as object) : {})}
              />
            </View>
            {reminderOn ? (
              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                {[
                  { l: '−1h', d: -60 },
                  { l: '−15m', d: -15 },
                  { l: '+15m', d: 15 },
                  { l: '+1h', d: 60 },
                ].map((b) => (
                  <Chip key={b.l} label={b.l} onPress={() => shiftTime(b.d)} />
                ))}
              </View>
            ) : null}
            <AppText variant="bodySm" color={t.palette.textMuted}>
              Also decides where the habit sits on Today: morning, focus & body, or evening.
            </AppText>
          </Card>

          {/* Note */}
          <Field label="Detail (optional)" small>
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="e.g. 15 min, Atomic Habits"
              placeholderTextColor={t.palette.textMuted}
              maxLength={40}
              accessibilityLabel="Habit detail"
              style={[
                t.typography.bodyMd,
                {
                  color: t.palette.textPrimary,
                  backgroundColor: t.palette.surfaceContainer,
                  borderRadius: t.radii.md,
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                  outlineStyle: 'none',
                } as object,
              ]}
            />
          </Field>

          {/* Colour */}
          <Field label="Atmosphere & Glow Theme" right={<AppText variant="labelSm" color={t.palette.textMuted}>{t.habitColors.length} core frequencies</AppText>}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', backgroundColor: t.palette.surfaceBase, borderRadius: t.radii.lg, padding: 8 }}>
              {t.habitColors.map((c) => {
                const sel = c === color;
                return (
                  <PressableScale
                    key={c}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: sel }}
                    accessibilityLabel={`Colour ${c}`}
                    scaleTo={0.9}
                    onPress={() => {
                      haptic.tap();
                      setColor(c);
                    }}
                    style={{
                      width: 42,
                      height: 42,
                      borderRadius: 21,
                      backgroundColor: c,
                      alignItems: 'center',
                      justifyContent: 'center',
                      boxShadow: sel ? `0px 0px 14px ${c}AA` : undefined,
                    }}>
                    {sel ? <Icon name="check" size={20} color={t.palette.surfaceBase} /> : null}
                  </PressableScale>
                );
              })}
            </View>
          </Field>

          {/* Momentum forecast */}
          {mode === 'create' ? (
            <Card level={2} style={{ gap: 14 }}>
              <View style={{ flexDirection: 'row', gap: 14 }}>
                <View style={{ width: 52, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: t.palette.surfaceBase, boxShadow: t.glows.flame }}>
                  <Icon name="local-fire-department" size={26} color={t.palette.streakFire} />
                </View>
                <View style={{ flex: 1, gap: 4 }}>
                  <AppText variant="labelSm" color={t.palette.streakFire} uppercase>
                    Momentum forecast
                  </AppText>
                  <AppText variant="labelLg" style={{ fontSize: 16, lineHeight: 22 }}>
                    Starting a 1-day streak toward your <AppText variant="labelLg" color={t.palette.primary} style={{ fontSize: 16 }}>21-Day Habit Badge</AppText>!
                  </AppText>
                  <AppText variant="bodySm" color={t.palette.textSecondary}>
                    Small daily reps compound. Check in once today to light the first segment.
                  </AppText>
                </View>
              </View>
              <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                {Array.from({ length: 6 }).map((_, i) => (
                  <View key={i} style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: i === 0 ? t.palette.primary : t.palette.surfaceBase }} />
                ))}
                <Icon name="emoji-events" size={16} color={t.palette.secondary} />
              </View>
            </Card>
          ) : null}

          <Button
            label={mode === 'create' ? 'Start Habit & Build Streak' : 'Save Changes'}
            icon={mode === 'create' ? 'bolt' : 'check'}
            size="lg"
            onPress={submit}
          />
          {mode === 'create' ? (
            <AppText variant="labelSm" color={t.palette.textMuted} align="center">
              Instant activation • No lockouts
            </AppText>
          ) : null}
          {onDelete ? <Button label="Delete habit" icon="delete-outline" tone="ghost" onPress={onDelete} /> : null}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({
  label,
  children,
  right,
  error,
  small,
}: {
  label: string;
  children: React.ReactNode;
  right?: React.ReactNode;
  error?: string | null;
  small?: boolean;
}) {
  const t = useTheme();
  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <AppText variant={small ? 'labelSm' : 'labelLg'} color={t.palette.textSecondary} uppercase={small}>
          {label}
        </AppText>
        {right}
      </View>
      {children}
      {error ? (
        <AppText variant="bodySm" color={t.palette.error} accessibilityLiveRegion="polite">
          {error}
        </AppText>
      ) : null}
    </View>
  );
}

function Chip({ label, icon, selected, onPress }: { label: string; icon?: React.ComponentProps<typeof Icon>['name']; selected?: boolean; onPress: () => void }) {
  const t = useTheme();
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={() => {
        haptic.tap();
        onPress();
      }}
      scaleTo={0.95}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 14,
        paddingVertical: 9,
        borderRadius: 999,
        backgroundColor: selected ? 'rgba(78,222,163,0.14)' : t.palette.surfaceContainer,
        borderWidth: 1,
        borderColor: selected ? 'rgba(78,222,163,0.35)' : 'transparent',
      }}>
      {icon ? <Icon name={icon} size={18} color={selected ? t.palette.primary : t.palette.textSecondary} /> : null}
      <AppText variant="labelLg" color={selected ? t.palette.primary : t.palette.textSecondary}>
        {label}
      </AppText>
    </PressableScale>
  );
}
