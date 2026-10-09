import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AccessibilityInfo, findNodeHandle, Modal, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/Icon';
import { Txt } from '@/components/Txt';
import { cityById, CITIES } from '@/data/cities';
import { useApp } from '@/store/app';
import { asym, brand, HIT, useColors } from '@/theme';

/** Compact "İzmir ▾" button for the hero; opens the city sheet. */
export function CityButton() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const name = cityById(useApp((s) => s.city)).name;
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('city.a11yButton', { name })}
        onPress={() => setOpen(true)}
        hitSlop={4}
        style={{
          minHeight: HIT,
          alignSelf: 'flex-start',
          flexDirection: 'row',
          alignItems: 'center',
          gap: 4,
        }}
      >
        <Icon name="pin" size={16} color={brand.orangeLight} />
        <Txt variant="bodyBold" color={brand.white} style={{ fontSize: 15 }}>
          {name}
        </Txt>
        <Icon name="chevronDown" size={16} color={brand.white} />
      </Pressable>
      <CitySheet visible={open} onClose={() => setOpen(false)} />
    </>
  );
}

function CitySheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const c = useColors();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const city = useApp((s) => s.city);
  const setCity = useApp((s) => s.setCity);
  const titleRef = useRef<View>(null);

  // Start screen-reader focus on the sheet title, not on the scrim.
  const focusTitle = () => {
    const node = titleRef.current ? findNodeHandle(titleRef.current) : null;
    if (node) AccessibilityInfo.setAccessibilityFocus(node);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      // Android back button and the iOS dismiss gesture.
      onRequestClose={onClose}
      onShow={focusTitle}
      supportedOrientations={['portrait', 'landscape']}
    >
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        {/* Tap outside closes; hidden from screen readers (the Kapat button covers it). */}
        <Pressable
          accessible={false}
          importantForAccessibility="no"
          onPress={onClose}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: '#0B3C4999',
          }}
        />
        <View
          accessibilityViewIsModal
          style={[
            asym(26, 8),
            {
              backgroundColor: c.card,
              paddingTop: 20,
              paddingHorizontal: 20,
              paddingBottom: Math.max(insets.bottom, 12) + 12,
              maxHeight: '90%',
            },
          ]}
        >
          <View ref={titleRef} accessible accessibilityRole="header">
            <Txt variant="title">{t('city.title')}</Txt>
          </View>
          <View style={{ marginTop: 8 }}>
            {CITIES.map((item) => {
              const selected = item.available && item.id === city;
              return (
                <Pressable
                  key={item.id}
                  accessibilityRole="button"
                  accessibilityLabel={
                    item.available
                      ? t(selected ? 'city.a11ySelected' : 'city.a11yRow', { name: item.name })
                      : t('city.a11ySoon', { name: item.name })
                  }
                  accessibilityState={{ disabled: !item.available, selected }}
                  disabled={!item.available}
                  onPress={() => {
                    setCity(item.id);
                    onClose();
                  }}
                  style={{
                    minHeight: 52,
                    paddingVertical: 8,
                    flexDirection: 'row',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    gap: 8,
                    borderTopWidth: 1,
                    borderTopColor: c.line,
                  }}
                >
                  <View style={{ width: 24 }}>
                    {selected && <Icon name="check" size={22} color={c.accentStrong} />}
                  </View>
                  <Txt
                    variant="bodyBold"
                    color={item.available ? undefined : c.textSecondary}
                    style={{ flexShrink: 1 }}
                  >
                    {item.name}
                  </Txt>
                  <View
                    style={{
                      paddingHorizontal: 10,
                      paddingVertical: 4,
                      borderRadius: 999,
                      backgroundColor: item.available ? c.badgeFreshBg : c.badgeUnknownBg,
                    }}
                  >
                    <Txt
                      variant="label"
                      color={item.available ? c.badgeFreshText : c.badgeUnknownText}
                    >
                      {t(item.available ? 'city.live' : 'city.soon')}
                    </Txt>
                  </View>
                </Pressable>
              );
            })}
          </View>
          <Txt variant="caption" secondary style={{ marginTop: 12 }}>
            {t('city.note')}
          </Txt>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('city.close')}
            onPress={onClose}
            style={[
              asym(18, 5),
              {
                marginTop: 16,
                minHeight: 52,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: brand.navy,
              },
            ]}
          >
            <Txt variant="bodyBold" color={brand.white}>
              {t('city.close')}
            </Txt>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
