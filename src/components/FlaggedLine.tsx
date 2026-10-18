import { useTranslation } from 'react-i18next';

import { useColors } from '@/theme';

import { Txt } from './Txt';

/** "Several people said it may be closed": a place flagged by reports (never hidden by them). */
export function FlaggedLine() {
  const c = useColors();
  const { t } = useTranslation();
  // Spoken as part of the card's label, so hidden from the screen reader here.
  return (
    <Txt
      variant="label"
      color={c.full}
      style={{ marginTop: 2 }}
      accessible={false}
      importantForAccessibility="no"
      accessibilityElementsHidden
    >
      {t('report.flagged')}
    </Txt>
  );
}
