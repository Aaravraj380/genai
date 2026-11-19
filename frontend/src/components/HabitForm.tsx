/**
 * Create / edit form — mirrors the Stitch "New Habit" sheet.
 * Fully translated; supports custom category tags, a custom reminder
 * message, and orders the weekday picker by the user's week start.
 */
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Switch, TextInput, View, type ScrollViewInstance } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { timesPerWeek } from '@/domain/format';
import type { Frequency, Habit, HabitIcon, Weekday } from '@/domain/types';
import { useT } from '@/i18n';
import { haptic } from '@/services/haptics';
import type { HabitInput } from '@/store/useHabitStore';
import { MAX_CATEGORY_LENGTH, useSettingsStore } from '@/store/useSettingsStore';
import { categories, habitIconGlyph, iconPresets } from '@/theme/icons';
import { useLayout, useTheme } from '@/theme/ThemeProvider';

import { SegmentedControl } from './animated';
import { AppText, Button, Card, Icon, IconButton, PressableScale } from './primitives';
import { formatTime } from './today';

type FreqType = Frequency['type'];
const MAX_TITLE = 60;
const MAX_MESSAGE = 80;

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
  const { t: tr, dates, category: categoryLabel } = useT();
  const insets = useSafeAreaInsets();
  const { gutter, maxContentWidth, isCompact } = useLayout();
  const weekStartsOn = useSettingsStore((s) => s.weekStartsOn);
  const customCategories = useSettingsStore((s) => s.customCategories);
  const addCategory = useSettingsStore((s) => s.addCategory);

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
  const [message, setMessage] = useState(initial?.reminder?.message ?? '');
  const [color, setColor] = useState(initial?.color ?? t.habitColors[0]);
  const [touched, setTouched] = useState(false);
  const [addingTag, setAddingTag] = useState(false);
  const [newTag, setNewTag] = useState('');
  const scrollRef = useRef<ScrollViewInstance>(null);

  const frequency: Frequency = freqType === 'custom' ? { type: 'custom', days: customDays } : { type: freqType };
  const titleError = touched && title.trim().length === 0 ? tr('form.nameError') : null;
  const daysError = freqType === 'custom' && customDays.length === 0 ? tr('form.daysError') : null;
  const valid = title.trim().length > 0 && !daysError;

  // Built-ins first, then the user's own tags; keep an edited habit's tag even if it was since removed.
  const tagOptions = [...categories, ...customCategories.filter((c) => !(categories as readonly string[]).includes(c))];
  if (!tagOptions.includes(category)) tagOptions.push(category);

  // Weekday picker in the user's week order.
  const week = Array.from({ length: 7 }, (_, i) => ((weekStartsOn + i) % 7) as Weekday);

  const freqOptions: { value: FreqType; label: string }[] = [
    { value: 'daily', label: tr('freq.daily') },
    { value: 'weekdays', label: tr('freq.weekdays') },
    { value: 'weekends', label: tr('freq.weekends') },
    { value: 'custom', label: tr('freq.custom') },
  ];

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
      reminder: {
        enabled: reminderOn,
        hour: Math.floor(minutes / 60),
        minute: minutes % 60,
        message: message.trim() || undefined,
      },
    });
  };

  const commitTag = () => {
    const clean = addCategory(newTag);
    if (clean) {
      setCategory(clean);
      haptic.success();
    }
    setNewTag('');
    setAddingTag(false);
  };

  const shiftTime = (delta: number) => setMinutes((m) => (m + delta + 24 * 60) % (24 * 60));
  const perWeek = timesPerWeek(frequency);
  const inputStyle = [
    t.typography.bodyMd,
    {
      color: t.palette.textPrimary,
      backgroundColor: t.palette.surfaceContainer,
      borderRadius: t.radii.md,
      paddingHorizontal: 14,
      paddingVertical: 12,
      outlineStyle: 'none',
    } as object,
  ];

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
                {tr('common.cancel')}
              </AppText>
            </PressableScale>
            <View style={{ alignItems: 'center', flexShrink: 1 }}>
              <AppText variant="headlineSm" numberOfLines={1} adjustsFontSizeToFit accessibilityRole="header">
                {mode === 'create' ? tr('form.createTitle') : tr('form.editHabit')}
              </AppText>
              <AppText variant="labelSm" color={t.palette.primary} uppercase>
                {tr('form.step')}
              </AppText>
            </View>
            <Button label={tr('common.save')} size="sm" onPress={submit} disabled={!valid && touched} />
          </View>

          {/* Name */}
          <Field label={tr('form.name')} error={titleError}>
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
                placeholder={tr('form.namePlaceholder')}
                placeholderTextColor={t.palette.textMuted}
                maxLength={MAX_TITLE}
                returnKeyType="done"
                accessibilityLabel={tr('form.name')}
                style={[t.typography.bodyLg, { flex: 1, color: t.palette.textPrimary, paddingVertical: 14, outlineStyle: 'none' } as object]}
              />
              {title ? (
                <PressableScale accessibilityLabel={tr('form.clearName')} onPress={() => setTitle('')} hitSlop={10}>
                  <Icon name="cancel" size={20} color={t.palette.textSecondary} />
                </PressableScale>
              ) : null}
            </View>
          </Field>

          {/* Icons */}
          <Field label={tr('form.icons')} small>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {iconPresets.map((p) => (
                <Chip key={p} selected={p === icon} onPress={() => setIcon(p)} label={tr(`icon.${p}`)} icon={habitIconGlyph[p]} />
              ))}
            </ScrollView>
          </Field>

          {/* Category (built-in + custom + new) */}
          <Field label={tr('form.category')} small>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {tagOptions.map((c) => (
                <Chip key={c} selected={c === category} onPress={() => setCategory(c)} label={`#${categoryLabel(c)}`} />
              ))}
              {addingTag ? null : <Chip label={tr('form.newCategory')} icon="add" onPress={() => setAddingTag(true)} />}
            </View>
            {addingTag ? (
              <Animated.View entering={FadeIn} style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                <TextInput
                  autoFocus
                  value={newTag}
                  onChangeText={setNewTag}
                  onSubmitEditing={commitTag}
                  placeholder={tr('form.categoryPlaceholder')}
                  placeholderTextColor={t.palette.textMuted}
                  maxLength={MAX_CATEGORY_LENGTH}
                  returnKeyType="done"
                  accessibilityLabel={tr('form.newCategory')}
                  style={[...inputStyle, { flex: 1 }]}
                />
                <Button label={tr('common.add')} size="sm" onPress={commitTag} disabled={!newTag.trim()} />
                <IconButton icon="close" label={tr('common.cancel')} size={38} onPress={() => { setAddingTag(false); setNewTag(''); }} />
              </Animated.View>
            ) : null}
          </Field>

          {/* Frequency */}
          <Field
            label={tr('form.frequency')}
            right={
              <AppText variant="labelSm" color={t.palette.primary}>
                {perWeek === 7 ? tr('form.unbroken') : tr('form.perWeek', { n: perWeek })}
              </AppText>
            }
            error={daysError}>
            <SegmentedControl options={freqOptions} value={freqType} onChange={setFreqType} />
            {freqType === 'custom' ? (
              <Animated.View entering={FadeIn} exiting={FadeOut} layout={LinearTransition} style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 }}>
                {week.map((d) => {
                  const on = customDays.includes(d);
                  return (
                    <PressableScale
                      key={d}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: on }}
                      accessibilityLabel={dates.weekdayLong(d)}
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
                        {dates.weekdayLetter(d)}
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
              <AppText variant="labelLg">{tr('form.target')}</AppText>
              <AppText variant="bodySm" color={t.palette.textSecondary}>
                {tr('form.timesPerDay', { n: target })}
              </AppText>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: t.palette.surfaceBase, borderRadius: 999, padding: 5 }}>
              <IconButton icon="remove" label={tr('form.decrease')} size={38} onPress={() => setTarget((v) => Math.max(1, v - 1))} />
              <AppText variant="headlineSm" color={t.palette.primary} tabular style={{ minWidth: 22, textAlign: 'center' }}>
                {target}
              </AppText>
              <IconButton icon="add" label={tr('form.increase')} size={38} onPress={() => setTarget((v) => Math.min(20, v + 1))} />
            </View>
          </Card>

          {/* Reminder */}
          <Card level={2} style={{ gap: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: t.palette.surfaceContainerHigh }}>
                <Icon name="alarm" size={22} color={t.palette.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <AppText variant="labelLg">{tr('form.reminder')}</AppText>
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
                accessibilityLabel={tr('form.reminder')}
                trackColor={{ false: t.palette.surfaceContainerHighest, true: t.palette.primary }}
                thumbColor={reminderOn ? t.palette.surfaceElevated : t.palette.textSecondary}
                {...(Platform.OS === 'web' ? ({ activeThumbColor: t.palette.surfaceElevated } as object) : {})}
              />
            </View>
            {reminderOn ? (
              <>
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
                <View style={{ gap: 8 }}>
                  <AppText variant="labelSm" color={t.palette.textSecondary} uppercase>
                    {tr('form.reminderMessage')}
                  </AppText>
                  <TextInput
                    value={message}
                    onChangeText={setMessage}
                    placeholder={tr('form.reminderMessagePlaceholder')}
                    placeholderTextColor={t.palette.textMuted}
                    maxLength={MAX_MESSAGE}
                    accessibilityLabel={tr('form.reminderMessage')}
                    style={[...inputStyle, { backgroundColor: t.palette.surfaceElevated }]}
                  />
                </View>
              </>
            ) : null}
            <AppText variant="bodySm" color={t.palette.textMuted}>
              {tr('form.reminderSlot')}
            </AppText>
          </Card>

          {/* Note */}
          <Field label={tr('form.detail')} small>
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder={tr('form.detailPlaceholder')}
              placeholderTextColor={t.palette.textMuted}
              maxLength={40}
              accessibilityLabel={tr('form.detail')}
              style={inputStyle}
            />
          </Field>

          {/* Colour */}
          <Field
            label={tr('form.colour')}
            right={
              <AppText variant="labelSm" color={t.palette.textMuted}>
                {tr('form.colourCount', { n: t.habitColors.length })}
              </AppText>
            }>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', backgroundColor: t.palette.surfaceBase, borderRadius: t.radii.lg, padding: 8 }}>
              {t.habitColors.map((c) => {
                const sel = c === color;
                return (
                  <PressableScale
                    key={c}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: sel }}
                    accessibilityLabel={tr('form.colourA11y', { c })}
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
                    {sel ? <Icon name="check" size={20} color="#0F1115" /> : null}
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
                    {tr('form.forecast')}
                  </AppText>
                  <AppText variant="labelLg" style={{ fontSize: 16, lineHeight: 22 }}>
                    {tr('form.forecastLead')}{' '}
                    <AppText variant="labelLg" color={t.palette.primary} style={{ fontSize: 16 }}>
                      {tr('form.forecastBadge')}
                    </AppText>
                    !
                  </AppText>
                  <AppText variant="bodySm" color={t.palette.textSecondary}>
                    {tr('form.forecastBody')}
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
            label={mode === 'create' ? tr('form.start') : tr('form.saveChanges')}
            icon={mode === 'create' ? 'bolt' : 'check'}
            size="lg"
            onPress={submit}
          />
          {mode === 'create' ? (
            <AppText variant="labelSm" color={t.palette.textMuted} align="center">
              {tr('form.instant')}
            </AppText>
          ) : null}
          {onDelete ? <Button label={tr('form.delete')} icon="delete-outline" tone="ghost" onPress={onDelete} /> : null}
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
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <AppText variant={small ? 'labelSm' : 'labelLg'} color={t.palette.textSecondary} uppercase={small} style={{ flexShrink: 1 }}>
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
        backgroundColor: selected ? 'rgba(16,185,129,0.14)' : t.palette.surfaceContainer,
        borderWidth: 1,
        borderColor: selected ? 'rgba(16,185,129,0.40)' : 'transparent',
      }}>
      {icon ? <Icon name={icon} size={18} color={selected ? t.palette.primary : t.palette.textSecondary} /> : null}
      <AppText variant="labelLg" color={selected ? t.palette.primary : t.palette.textSecondary}>
        {label}
      </AppText>
    </PressableScale>
  );
}
