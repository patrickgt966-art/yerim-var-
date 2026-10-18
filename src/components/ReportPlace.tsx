import { useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { sendPlaceReport } from '@/lib/placeReports';
import { REPORT_KINDS, useReports, type ReportKind } from '@/store/reports';

import { Button } from './Button';
import { Chip } from './Chip';
import { Txt } from './Txt';

type Props = {
  placeId: string;
  place: 'food' | 'parking';
  name: string;
  /** The button's label ("Yanlış bilgi / kapanmış bildir"). */
  label: string;
  /** Opens the prefilled GitHub issue, for a report with details. */
  onDetails: () => void;
};

/**
 * "Report" on a place: one tap picks the reason (closed, wrong location, wrong info) and sends it
 * anonymously; a place reported closed leaves this device's lists at once and can be taken back.
 * Details still go to the GitHub form.
 */
export function ReportPlace({ placeId, place, name, label, onDetails }: Props) {
  const { t } = useTranslation();
  const mine = useReports((s) => s.mine[placeId]);
  const removeMine = useReports((s) => s.removeMine);
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState<'ok' | 'offline' | null>(null);

  const pick = async (kind: ReportKind) => {
    setOpen(false);
    setSent((await sendPlaceReport(placeId, place, kind)) ? 'ok' : 'offline');
  };

  if (mine?.kind === 'closed') {
    return (
      <View style={{ gap: 8 }}>
        <Txt variant="caption" secondary accessibilityLiveRegion="polite">
          {sent ? `${t(sent === 'ok' ? 'report.thanks' : 'report.thanksOffline')} ` : ''}
          {t(sent ? 'report.hiddenHere' : 'report.reportedClosed')}
        </Txt>
        <Button
          kind="secondary"
          label={t('report.undo')}
          accessibilityLabel={`${t('report.undo')}: ${name}`}
          onPress={() => {
            removeMine(placeId);
            setSent(null);
          }}
        />
      </View>
    );
  }

  if (!open) {
    return (
      <View style={{ gap: 8 }}>
        {sent ? (
          <Txt variant="caption" secondary accessibilityLiveRegion="polite">
            {t(sent === 'ok' ? 'report.thanks' : 'report.thanksOffline')}
          </Txt>
        ) : null}
        <Button
          kind="secondary"
          label={label}
          accessibilityLabel={`${label}: ${name}`}
          onPress={() => setOpen(true)}
        />
      </View>
    );
  }

  return (
    <View style={{ gap: 10 }}>
      <Txt variant="label">{t('report.title')}</Txt>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {REPORT_KINDS.map((k) => (
          <Chip key={k} selected={false} label={t(`report.${k}`)} onPress={() => void pick(k)} />
        ))}
      </View>
      <Txt variant="caption" secondary>
        {t('report.note')}
      </Txt>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <Chip
          selected={false}
          label={t('report.details')}
          onPress={() => {
            setOpen(false);
            onDetails();
          }}
        />
        <Chip selected={false} label={t('report.cancel')} onPress={() => setOpen(false)} />
      </View>
    </View>
  );
}
