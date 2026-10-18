import {
  bandMinutes,
  carBands,
  estimateCost,
  heavyVehicleTariff,
  isHeavyVehicleName,
  parkCost,
  tariffCost,
  tariffFor,
  type Tariff,
} from '../tariffs';

const ispark: Tariff = {
  parkingId: 'ispark-3068',
  hourly: 110,
  currency: 'TRY',
  bands: [
    { label: '0-1 Saat', price: 110 },
    { label: '1-2 Saat', price: 140 },
    { label: '2-4 Saat', price: 170 },
    { label: '4-8 Saat', price: 220 },
    { label: '8-12 Saat', price: 260 },
    { label: 'Tam Gün', price: 370 },
  ],
  priceKind: 'official',
  validFrom: null,
  source: 'İBB İSPARK',
  verifiedAt: '2026-10-17',
  freeMinutes: 15,
};

describe('banded tariffs', () => {
  it('reads band lengths from the labels', () => {
    expect(bandMinutes('0-1 Saat')).toBe(60);
    expect(bandMinutes('2-4 saat')).toBe(240);
    expect(bandMinutes('Tam Gün')).toBe(1440);
    expect(bandMinutes('Günlük')).toBe(1440);
    expect(bandMinutes('Gece')).toBeNull();
  });

  it('prices a stay by its band, not hourly rate x hours', () => {
    expect(tariffCost(ispark, 10)).toBe(0); // inside the free 15 minutes
    expect(tariffCost(ispark, 40)).toBe(110);
    expect(tariffCost(ispark, 120)).toBe(140);
    expect(tariffCost(ispark, 180)).toBe(170); // hourly x hours would say 330
    expect(estimateCost(110, 180)).toBe(330);
    expect(tariffCost(ispark, 13 * 60)).toBe(370);
    expect(tariffCost(ispark, 30 * 60)).toBe(740); // two started days
  });

  it('gives null when no band can be read, so the hourly estimate is used', () => {
    expect(tariffCost({ ...ispark, bands: [{ label: 'Gece', price: 50 }] }, 60)).toBeNull();
  });
});

// Per-vehicle bands as published for ispark-1189 / ispark-2449 (data/tariffs-ispark.json).
const VEHICLES = ['Kamyon', 'Minibüs-Kamyonet', 'Otomobil', 'Tır'];
const PRICES: Record<string, number[]> = {
  '0-3 Saat': [120, 50, 70, 160],
  '3-5 Saat': [150, 100, 90, 180],
  '5-8 Saat': [250, 150, 120, 300],
  '8-12 Saat': [350, 200, 140, 450],
  'Tam Gün': [450, 300, 220, 600],
};
const perVehicle: Tariff = {
  ...ispark,
  parkingId: 'ispark-x',
  hourly: null,
  bands: Object.entries(PRICES).flatMap(([len, prices]) =>
    VEHICLES.map((v, i) => ({ label: `${len} ${v}`, price: prices[i]! })),
  ),
};

describe('vehicle classes', () => {
  it('prices a car from the car bands, never the truck ones', () => {
    expect(carBands(perVehicle.bands).map((b) => b.label)).toEqual([
      '0-3 Saat Otomobil',
      '3-5 Saat Otomobil',
      '5-8 Saat Otomobil',
      '8-12 Saat Otomobil',
      'Tam Gün Otomobil',
    ]);
    expect(tariffCost(perVehicle, 120)).toBe(70);
    expect(tariffCost(perVehicle, 240)).toBe(90);
    expect(tariffCost(perVehicle, 10 * 60)).toBe(140);
    expect(tariffCost(perVehicle, 13 * 60)).toBe(220);
    expect(tariffCost(perVehicle, 30 * 60)).toBe(440);
  });

  it('drops other vehicles and valet when no car class is named', () => {
    const bands = [
      { label: '0-1 Saat', price: 50 },
      { label: 'Vale', price: 400 },
      { label: '0-12 Saat(Motosiklet )', price: 60 },
      { label: 'Tam Gün', price: 200 },
    ];
    expect(carBands(bands).map((b) => b.label)).toEqual(['0-1 Saat', 'Tam Gün']);
    expect(tariffCost({ ...ispark, bands: [{ label: 'Vale', price: 400 }] }, 60)).toBeNull();
  });

  it('serves the bundled İSPARK tariffs with car bands only', () => {
    expect(tariffFor('ispark-1189')?.bands.every((b) => /Otomobil/.test(b.label))).toBe(true);
    expect(parkCost('ispark-1189', null, 120)).toBe(70);
    expect(parkCost('ispark-2449', null, 24 * 60)).toBe(220);
    // Bus park and valet-only park: no car price at all.
    expect(tariffFor('ispark-1912')).toBeNull();
    expect(tariffFor('ispark-3265')).toBeNull();
    expect(tariffFor('ispark-2216')).toBeNull();
  });

  it('knows bus and truck parks by tariff and by name', () => {
    expect(heavyVehicleTariff('ispark-1912')).toBe(true); // "1-2 Saat Otobüs" ...
    expect(heavyVehicleTariff('ispark-2216')).toBe(true); // Kamyon / Kamyonet/Jeep/Minibüs / Tır
    expect(heavyVehicleTariff('ispark-1189')).toBe(false);
    expect(heavyVehicleTariff('ispark-3265')).toBe(false); // valet: a car park
    for (const n of [
      'Alibeyköy Cep Otogarı Otobüs Otoparkı',
      'Tır Parkı',
      'ATAŞLAR TIR PARKI',
      'Bursa Kamyon Garajı',
      'İspark Minibüs Depolama Alanı',
      'Alanya Özel Halk Otobüsleri',
      'Trucks',
    ])
      expect(isHeavyVehicleName(n)).toBe(true);
    for (const n of [
      'Alibeyköy Cep Otogarı Açık Otoparkı',
      'Otobüs Terminali Otoparkı',
      'Metrobüs Otoparkı',
      'Satır Sokak Otoparkı',
      null,
    ])
      expect(isHeavyVehicleName(n)).toBe(false);
  });
});

describe('band labels', () => {
  it('reads "25 Dk-1 Saat" as the band up to an hour', () => {
    expect(bandMinutes('25 Dk-1 Saat')).toBe(60);
    // ispark-1913: 25 free minutes, then 70 TL up to an hour (not the 1-2 h price).
    expect(parkCost('ispark-1913', null, 40)).toBe(70);
    expect(parkCost('ispark-1913', null, 20)).toBe(0);
  });
});

describe('İzmir price list', () => {
  it('prices İzelman car parks from the official list', () => {
    // Konak Katlı Otoparkı: 0-2 saat 150, 2-4 saat 180, ..., 12-24 saat 300 (2026-02-16).
    const konak = tariffFor('izelman-342e739365');
    expect(konak).toMatchObject({ priceKind: 'official', verifiedAt: '2026-02-16' });
    expect(parkCost('izelman-342e739365', null, 90)).toBe(150);
    expect(parkCost('izelman-342e739365', null, 13 * 60)).toBe(300);
    // The day band ("12-24 Saat") is charged per started day.
    expect(parkCost('izelman-342e739365', null, 30 * 60)).toBe(600);
    // Only car columns: no motorcycle or disabled-badge prices.
    expect(konak?.bands.some((b) => /motosiklet|engelli/i.test(b.label))).toBe(false);
  });
});
