import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { Icon } from '@/components/Icon';
import { Txt } from '@/components/Txt';
import type { PlanData } from '@/data/assistant';
import { planShareText, shareText } from '@/lib/share';
import { brand, fonts, HIT, useColors } from '@/theme';

import { softShadow } from './style';

/** "Park, walk, eat": the steps are templates filled with our own data (see askPlan). */
export function PlanCard({
  plan,
  onDirections,
}: {
  plan: PlanData;
  onDirections: (dest: PlanData['dest']) => void;
}) {
  const c = useColors();
  const { t } = useTranslation();
  const label = [t('chat.planTitle'), ...plan.steps.map((s, i) => `${i + 1}. ${s}`), plan.why]
    .filter(Boolean)
    .join('. ');
  return (
    <View
      accessible={false}
      style={[
        {
          marginLeft: 54,
          marginRight: 16,
          padding: 12,
          gap: 8,
          borderRadius: 18,
          borderWidth: 1.5,
          borderColor: brand.orangeLight,
          backgroundColor: c.card,
        },
        softShadow(0.08),
      ]}
    >
      <View accessible accessibilityLabel={label} style={{ gap: 8 }}>
        <Txt style={{ fontFamily: fonts.display, fontSize: 16, lineHeight: 20 }}>
          {t('chat.planTitle')}
        </Txt>
        {plan.steps.map((step, i) => (
          <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
            <View
              style={{
                width: 22,
                height: 22,
                borderRadius: 11,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: c.hero,
              }}
            >
              <Txt
                accessible={false}
                allowFontScaling={false}
                color={c.onHero}
                style={{ fontFamily: fonts.bodyExtraBold, fontSize: 12, lineHeight: 16 }}
              >
                {i + 1}
              </Txt>
            </View>
            <Txt style={{ flexShrink: 1, fontSize: 14, lineHeight: 20 }}>{step}</Txt>
          </View>
        ))}
        {plan.why && (
          <Txt secondary style={{ fontSize: 12, lineHeight: 16 }}>
            {plan.why}
          </Txt>
        )}
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('chat.directionsLabel', { name: plan.dest.name })}
          onPress={() => onDirections(plan.dest)}
          style={({ pressed }) => ({
            flex: 1,
            minHeight: HIT,
            borderRadius: 12,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: c.hero,
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <Txt
            accessible={false}
            color={c.onHero}
            style={{ fontFamily: fonts.bodyExtraBold, fontSize: 13, lineHeight: 18 }}
          >
            {t('chat.directions')}
          </Txt>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('share.a11yPlan')}
          onPress={() => void shareText(planShareText(plan, t))}
          style={({ pressed }) => ({
            minHeight: HIT,
            paddingHorizontal: 14,
            borderRadius: 12,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            borderWidth: 1.5,
            borderColor: c.line,
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <Icon name="share" size={18} color={c.text} />
          <Txt
            accessible={false}
            style={{ fontFamily: fonts.bodyExtraBold, fontSize: 13, lineHeight: 18 }}
          >
            {t('share.button')}
          </Txt>
        </Pressable>
      </View>
    </View>
  );
}
