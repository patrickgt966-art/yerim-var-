import { cleanName } from '../names';

describe('cleanName', () => {
  it.each([
    ['SÃ¶ÄŸÃ¼ÅŸÃ§Ã¼ Murat 2', 'Söğüşçü Murat 2'],
    ['BARAN BALIK', 'Baran Balık'],
    ['annem pide', 'Annem Pide'],
    ['1924 Gonen Kemeralti', '1924 Gonen Kemeraltı'],
    ['Alacati Balik Evi', 'Alaçatı Balık Evi'],
    [
      'Bayraklı Tesadüf Meyhane | Bayraklıda Meyhane | Bayraklıda Fasıl',
      'Bayraklı Tesadüf Meyhane',
    ],
    ['bimola_cafeee', 'Bimola Cafeee'],
    ['Karabolu  Köy Kahvesi', 'Karabolu Köy Kahvesi'],
    ["Cafe'in Pluss & Bistro { İzmir }", "Cafe'in Pluss & Bistro"],
    ['ÇARSI BALIK 🐟Midye', 'ÇARSI BALIK Midye'],
    ['Ata Duragı Bornova Izmir', 'Ata Duragı Bornova'],
    ['Park Balık Pişiricisi, Bostanlı-Izmir', 'Park Balık Pişiricisi, Bostanlı'],
    ['Sarraf İzmir', 'Sarraf İzmir'],
    ['Look Mey Izmir', 'Look Mey İzmir'],
    ['The Optimist Coffee Co.', 'The Optimist Coffee Co.'],
    ['KFC', 'KFC'],
    ['KFC BORNOVA', 'KFC Bornova'],
    ['Aday Izmir Pilavci', 'Aday İzmir Pilavcı'],
    ["McDonald's", "McDonald's"],
    ['ALACATI BALIK EVI', 'Alaçatı Balık Evi'],
    ['BİRALEM', 'Biralem'],
    ['AYIŞIĞI BEACH BAR', 'Ayışığı Beach Bar'],
    ['IZMIR KOFTECISI', 'İzmir Koftecisi'],
    ['kebap ve köfte', 'Kebap ve Köfte'],
  ])('%s -> %s', (input, expected) => {
    expect(cleanName(input)).toBe(expected);
  });

  it('keeps the original when the mojibake cannot be decoded', () => {
    expect(cleanName('Ã Ä x')).toBe('Ã Ä x');
  });
});
