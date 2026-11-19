/**
 * Settings — everything the user can personalise:
 * profile (name + photo), theme, language, week start, streak freezes,
 * custom category tags, optional account sync, and data (backup / restore / reset).
 */
import { useState } from 'react';
import { ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AccountSection } from '@/components/AccountSection';
import { SegmentedControl } from '@/components/animated';
import { ProfileImage, StackHeader } from '@/components/chrome';
import { DataSection } from '@/components/DataSection';
import { AppText, Button, Card, Icon, IconButton, PressableScale } from '@/components/primitives';
import { useToast } from '@/components/Toast';
import { SectionHeader } from '@/components/today';
import type { Weekday } from '@/domain/types';
import { LANGUAGE_NAMES, useT } from '@/i18n';
import { haptic } from '@/services/haptics';
import { deleteProfilePhotos, pickProfilePhoto } from '@/services/profile';
import {
  MAX_CATEGORY_LENGTH,
  MAX_FREEZES,
  useSettingsStore,
  type Language,
  type ThemePreference,
} from '@/store/useSettingsStore';
import { categories, tintForCategory } from '@/theme/icons';
import { useLayout, useTheme } from '@/theme/ThemeProvider';

export default function SettingsScreen() {
  const t = useTheme();
  const { t: tr, category } = useT();
  const insets = useSafeAreaInsets();
  const { gutter, maxContentWidth } = useLayout();
  const s = useSettingsStore();
  const [toast, flash] = useToast();
  const [newTag, setNewTag] = useState('');

  const choosePhoto = async () => {
    const res = await pickProfilePhoto();
    if (res.status === 'picked') {
      s.setAvatarUri(res.uri);
      haptic.success();
    } else if (res.status === 'denied') {
      flash(tr('set.photoDenied'));
    }
  };

  const addTag = () => {
    if (s.addCategory(newTag)) haptic.success();
    setNewTag('');
  };

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
    <View style={{ flex: 1, backgroundColor: t.palette.surface }}>
      <StackHeader title={tr('set.title')} right={<View style={{ width: 44 }} />} />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: gutter, paddingBottom: insets.bottom + 40, gap: 24, width: '100%', maxWidth: maxContentWidth, alignSelf: 'center' }}>
        {/* ---- Profile ---- */}
        <View style={{ gap: 10 }}>
          <SectionHeader icon="person" iconColor={t.palette.primary} title={tr('set.profile')} />
          <Card style={{ gap: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
              <PressableScale accessibilityRole="button" accessibilityLabel={tr('set.choosePhoto')} onPress={choosePhoto} scaleTo={0.95}>
                <ProfileImage size={72} />
                <View
                  style={{
                    position: 'absolute',
                    right: -2,
                    bottom: -2,
                    width: 26,
                    height: 26,
                    borderRadius: 13,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: t.palette.primary,
                    borderWidth: 2,
                    borderColor: t.palette.surfaceElevated,
                  }}>
                  <Icon name="photo-camera" size={14} color={t.palette.onPrimary} />
                </View>
              </PressableScale>
              <View style={{ flex: 1, gap: 6 }}>
                <AppText variant="labelSm" color={t.palette.textSecondary} uppercase>
                  {tr('set.name')}
                </AppText>
                <TextInput
                  value={s.profileName}
                  onChangeText={s.setProfileName}
                  placeholder={tr('set.namePlaceholder')}
                  placeholderTextColor={t.palette.textMuted}
                  maxLength={40}
                  accessibilityLabel={tr('set.name')}
                  style={inputStyle}
                />
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
              <Button
                label={s.avatarUri ? tr('set.changePhoto') : tr('set.choosePhoto')}
                icon="photo-library"
                tone="ghost"
                size="sm"
                onPress={choosePhoto}
              />
              {s.avatarUri ? (
                <Button
                  label={tr('set.removePhoto')}
                  icon="delete-outline"
                  tone="ghost"
                  size="sm"
                  onPress={() => {
                    deleteProfilePhotos();
                    s.setAvatarUri(null);
                  }}
                />
              ) : null}
            </View>
          </Card>
        </View>

        {/* ---- Account & sync (optional) ---- */}
        <AccountSection />

        {/* ---- Appearance ---- */}
        <Setting title={tr('set.appearance')} icon="palette">
          <SegmentedControl<ThemePreference>
            value={s.theme}
            onChange={s.setTheme}
            options={[
              { value: 'system', label: tr('set.theme.system') },
              { value: 'dark', label: tr('set.theme.dark') },
              { value: 'light', label: tr('set.theme.light') },
            ]}
          />
        </Setting>

        {/* ---- Language ---- */}
        <Setting title={tr('set.language')} icon="translate">
          <SegmentedControl<Language>
            value={s.language}
            onChange={s.setLanguage}
            options={(['en', 'hi', 'bn'] as const).map((l) => ({ value: l, label: LANGUAGE_NAMES[l] }))}
          />
        </Setting>

        {/* ---- Week start ---- */}
        <Setting title={tr('set.week')} icon="calendar-today">
          <SegmentedControl<'1' | '0'>
            value={String(s.weekStartsOn) as '1' | '0'}
            onChange={(v) => s.setWeekStartsOn(Number(v) as Weekday)}
            options={[
              { value: '1', label: tr('set.monday') },
              { value: '0', label: tr('set.sunday') },
            ]}
          />
        </Setting>

        {/* ---- Freezes ---- */}
        <Setting title={tr('set.freezes')} icon="ac-unit">
          <Card level={2} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <AppText variant="bodySm" color={t.palette.textSecondary} style={{ flex: 1 }}>
              {tr('set.freezesHelp')}
            </AppText>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: t.palette.surfaceBase, borderRadius: 999, padding: 5 }}>
              <IconButton icon="remove" label="−" size={36} onPress={() => s.setFreezesPerMonth(s.freezesPerMonth - 1)} />
              <AppText variant="headlineSm" color={t.palette.tertiary} tabular style={{ minWidth: 20, textAlign: 'center' }}>
                {s.freezesPerMonth}
              </AppText>
              <IconButton
                icon="add"
                label="+"
                size={36}
                onPress={() => s.setFreezesPerMonth(Math.min(MAX_FREEZES, s.freezesPerMonth + 1))}
              />
            </View>
          </Card>
        </Setting>

        {/* ---- Category tags ---- */}
        <Setting title={tr('set.categories')} icon="sell">
          <AppText variant="labelSm" color={t.palette.textMuted} uppercase>
            {tr('set.builtIn')}
          </AppText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {categories.map((c) => (
              <Tag key={c} label={category(c)} tint={tintForCategory(c)} />
            ))}
          </View>
          <AppText variant="labelSm" color={t.palette.textMuted} uppercase style={{ marginTop: 6 }}>
            {tr('set.yourTags')}
          </AppText>
          {s.customCategories.length === 0 ? (
            <AppText variant="bodySm" color={t.palette.textSecondary}>
              {tr('set.noTags')}
            </AppText>
          ) : (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {s.customCategories.map((c) => (
                <Tag key={c} label={c} tint={tintForCategory(c)} onRemove={() => s.removeCategory(c)} removeLabel={tr('set.removeTag', { tag: c })} />
              ))}
            </View>
          )}
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <TextInput
              value={newTag}
              onChangeText={setNewTag}
              onSubmitEditing={addTag}
              placeholder={tr('form.categoryPlaceholder')}
              placeholderTextColor={t.palette.textMuted}
              maxLength={MAX_CATEGORY_LENGTH}
              returnKeyType="done"
              accessibilityLabel={tr('form.newCategory')}
              style={[...inputStyle, { flex: 1 }]}
            />
            <Button label={tr('common.add')} icon="add" size="sm" onPress={addTag} disabled={!newTag.trim()} />
          </View>
        </Setting>

        {/* ---- Reminders (per habit) ---- */}
        <Setting title={tr('set.reminders')} icon="alarm">
          <AppText variant="bodySm" color={t.palette.textSecondary}>
            {tr('set.remindersHelp')}
          </AppText>
        </Setting>

        <DataSection onToast={flash} />
      </ScrollView>
      {toast}
    </View>
  );
}

function Setting({ title, icon, children }: { title: string; icon: React.ComponentProps<typeof Icon>['name']; children: React.ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ gap: 10 }}>
      <SectionHeader icon={icon} iconColor={t.palette.tertiary} title={title} />
      {children}
    </View>
  );
}

function Tag({
  label,
  tint,
  onRemove,
  removeLabel,
}: {
  label: string;
  tint: 'cobalt' | 'emerald' | 'flame';
  onRemove?: () => void;
  removeLabel?: string;
}) {
  const t = useTheme();
  const c = t.tagTints[tint];
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingLeft: 12, paddingRight: onRemove ? 4 : 12, paddingVertical: 6, borderRadius: 999, backgroundColor: c.bg }}>
      <AppText variant="labelMd" color={c.fg}>
        #{label}
      </AppText>
      {onRemove ? (
        <PressableScale accessibilityRole="button" accessibilityLabel={removeLabel} onPress={onRemove} hitSlop={8} style={{ padding: 2 }}>
          <Icon name="close" size={16} color={c.fg} />
        </PressableScale>
      ) : null}
    </View>
  );
}
