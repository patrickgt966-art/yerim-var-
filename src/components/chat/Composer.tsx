import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, TextInput, View } from 'react-native';

import { Icon } from '@/components/Icon';
import { Txt } from '@/components/Txt';
import { MAX_MESSAGE_CHARS } from '@/lib/ai/protocol';
import { brand, fonts, useColors } from '@/theme';

import { softShadow } from './style';

/** Paper input bar: suggestion pills above a white rounded field and a round orange send button. */
export function Composer({
  value,
  onChange,
  onSubmit,
  suggestions,
  onPick,
  bottom,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  suggestions: string[];
  onPick: (text: string) => void;
  bottom: number;
}) {
  const c = useColors();
  const { t } = useTranslation();
  return (
    <View
      style={[
        { paddingTop: 10, paddingHorizontal: 12, paddingBottom: bottom, backgroundColor: c.bg },
        softShadow(0.06, -2, 10),
      ]}
    >
      {suggestions.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          accessibilityLabel={t('chat.sugGroup')}
          style={{ flexGrow: 0, marginBottom: 8 }}
          contentContainerStyle={{ gap: 6, alignItems: 'center', paddingVertical: 6 }}
        >
          {suggestions.map((s) => (
            <Pressable
              key={s}
              accessibilityRole="button"
              accessibilityLabel={t('chat.sugLabel', { text: s })}
              onPress={() => onPick(s)}
              hitSlop={{ top: 6, bottom: 6 }}
              style={({ pressed }) => ({
                minHeight: 32,
                paddingHorizontal: 12,
                borderRadius: 16,
                justifyContent: 'center',
                backgroundColor: pressed ? brand.peachSoft : c.card,
                borderWidth: 1.5,
                borderColor: brand.peachLine,
              })}
            >
              <Txt style={{ fontFamily: fonts.bodyBold, fontSize: 13, lineHeight: 18 }}>{s}</Txt>
            </Pressable>
          ))}
        </ScrollView>
      )}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <TextInput
          value={value}
          onChangeText={onChange}
          // The assistant reads at most this much of a message.
          maxLength={MAX_MESSAGE_CHARS}
          onSubmitEditing={onSubmit}
          placeholder={t('chat.placeholder')}
          placeholderTextColor={c.textSecondary}
          accessibilityLabel={t('chat.placeholder')}
          returnKeyType="send"
          style={{
            flex: 1,
            minHeight: 48,
            paddingHorizontal: 16,
            borderRadius: 24,
            fontFamily: fonts.body,
            fontSize: 15,
            color: c.text,
            backgroundColor: c.card,
            borderWidth: 1,
            borderColor: brand.peachLine,
          }}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('chat.send')}
          onPress={onSubmit}
          style={[
            {
              width: 48,
              height: 48,
              borderRadius: 24,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: c.accent,
            },
            { ...softShadow(0.4, 6, 14), shadowColor: brand.orange },
          ]}
        >
          <Icon name="arrow" size={20} color={brand.navy} strokeWidth={2.6} />
        </Pressable>
      </View>
    </View>
  );
}
