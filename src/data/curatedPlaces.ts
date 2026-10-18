import type { CuratedPlace } from './places';

/**
 * Hand-picked places of the other open cities: well-known names the OSM list lacks, names it
 * spells differently, and the short names people use ("Heykel", "7. Cadde", "ODTÜ"). Where our
 * own data has the place, the coordinates are copied from that record; the rest are the
 * place's centre (±300 m). `aliases` are folded words that count as an exact match.
 */
export const CITY_CURATED_PLACES: Record<string, CuratedPlace[]> = {
  istanbul: [
    {
      name: 'Bağdat Caddesi',
      district: 'Kadıköy',
      kind: 'area',
      lat: 40.9655,
      lng: 29.0745,
      aliases: ['bagdat caddesi', 'bagdat cad', 'bagdat'],
    },
    // "Kadıköy İskelesi" in the data is the Eminönü pier of the Kadıköy line.
    {
      name: 'Kadıköy İskelesi',
      district: 'Kadıköy',
      kind: 'pier',
      lat: 40.9927,
      lng: 29.0227,
      aliases: ['kadikoy iskelesi', 'kadikoy iskele', 'kadikoy vapur iskelesi'],
    },
    // İstanbul Cevahir AVM record.
    {
      name: 'Cevahir AVM',
      district: 'Şişli',
      kind: 'landmark',
      lat: 41.0626,
      lng: 28.9929,
      aliases: ['cevahir', 'cevahir avm', 'istanbul cevahir'],
    },
    // İTÜ-Ayazağa rail stop: the main campus.
    {
      name: 'İTÜ Ayazağa Kampüsü',
      district: 'Sarıyer',
      kind: 'landmark',
      lat: 41.1053,
      lng: 29.023,
      aliases: ['itu', 'istanbul teknik universitesi', 'itu ayazaga'],
    },
    // Dolmabahçe Sarayı record.
    {
      name: 'Dolmabahçe Sarayı',
      district: 'Beşiktaş',
      kind: 'landmark',
      lat: 41.039,
      lng: 28.9996,
      aliases: ['dolmabahce', 'dolmabahce sarayi'],
    },
    // Vadistanbul AVM record.
    {
      name: 'Vadistanbul AVM',
      district: 'Sarıyer',
      kind: 'landmark',
      lat: 41.1074,
      lng: 28.9874,
      aliases: ['vadi istanbul', 'vadistanbul'],
    },
  ],
  ankara: [
    {
      name: 'Tunalı Hilmi Caddesi',
      district: 'Çankaya',
      kind: 'area',
      lat: 39.9035,
      lng: 32.8608,
      aliases: ['tunali hilmi', 'tunali hilmi caddesi', 'tunali caddesi'],
    },
    {
      name: 'Atakule',
      district: 'Çankaya',
      kind: 'landmark',
      lat: 39.8857,
      lng: 32.8558,
      aliases: ['atakule'],
    },
    {
      name: 'Bahçelievler 7. Cadde',
      district: 'Çankaya',
      kind: 'area',
      lat: 39.9228,
      lng: 32.8236,
      aliases: ['7 cadde', 'yedinci cadde', 'bahcelievler 7 cadde', 'emek 7 cadde'],
    },
    // Orta Doğu Teknik Üniversitesi record (campus).
    {
      name: 'ODTÜ Kampüsü',
      district: 'Çankaya',
      kind: 'landmark',
      lat: 39.8913,
      lng: 32.7838,
      aliases: ['odtu', 'odtu kampus', 'orta dogu teknik universitesi', 'metu'],
    },
    {
      name: 'Esenboğa Havalimanı',
      district: 'Çubuk',
      kind: 'landmark',
      lat: 40.1281,
      lng: 32.9951,
      aliases: ['esenboga', 'esenboga havalimani', 'ankara havalimani'],
    },
  ],
  bursa: [
    {
      name: 'Kapalıçarşı',
      district: 'Osmangazi',
      kind: 'landmark',
      lat: 40.184,
      lng: 29.0628,
      aliases: ['kapalicarsi', 'kapali carsi', 'bursa kapali carsi'],
    },
    {
      name: 'Tophane Saat Kulesi',
      district: 'Osmangazi',
      kind: 'landmark',
      lat: 40.1868,
      lng: 29.0566,
      aliases: ['tophane', 'tophane saat kulesi'],
    },
    // Ski resort hotels (Grand Yazıcı, Genç Yazıcı): Uludağ's Oteller Bölgesi.
    {
      name: 'Uludağ',
      district: 'Osmangazi',
      kind: 'landmark',
      lat: 40.1045,
      lng: 29.135,
      aliases: ['uludag', 'uludag oteller', 'uludag kayak merkezi'],
    },
    {
      name: 'Teleferik Teferrüç İstasyonu',
      district: 'Yıldırım',
      kind: 'station',
      lat: 40.178,
      lng: 29.0855,
      aliases: ['teleferik', 'bursa teleferik', 'teferruc'],
    },
    // Fatih Sultan Mehmet rail stop on the boulevard.
    {
      name: 'Fatih Sultan Mehmet Bulvarı',
      district: 'Nilüfer',
      kind: 'area',
      lat: 40.2115,
      lng: 28.9755,
      aliases: ['fsm bulvari', 'fsm', 'fatih sultan mehmet bulvari'],
    },
    // Atatürk Heykeli record (city centre).
    {
      name: 'Heykel',
      district: 'Osmangazi',
      kind: 'area',
      lat: 40.1826,
      lng: 29.0669,
      aliases: ['heykel', 'bursa heykel'],
    },
    {
      name: 'Setbaşı',
      district: 'Yıldırım',
      kind: 'area',
      lat: 40.1822,
      lng: 29.0716,
      aliases: ['setbasi', 'setbasi koprusu'],
    },
    // Bursa Şehirlerarası Otobüs Terminali record.
    {
      name: 'Bursa Otogarı',
      district: 'Osmangazi',
      kind: 'station',
      lat: 40.2653,
      lng: 29.0531,
      aliases: ['otogar', 'bursa otogar', 'bursa terminal', 'terminal'],
    },
  ],
  antalya: [
    {
      name: 'Kaleiçi',
      district: 'Muratpaşa',
      kind: 'area',
      lat: 36.8845,
      lng: 30.7055,
      aliases: ['kaleici'],
    },
    // The data's "Hadrianus Kapısı" is the one in Phaselis (Kemer).
    {
      name: 'Hadrian Kapısı',
      district: 'Muratpaşa',
      kind: 'landmark',
      lat: 36.8854,
      lng: 30.7086,
      aliases: ['hadrian kapisi', 'hadrianus kapisi', 'uc kapilar', 'hadrian'],
    },
    {
      name: 'Yivli Minare',
      district: 'Muratpaşa',
      kind: 'landmark',
      lat: 36.8873,
      lng: 30.7041,
      aliases: ['yivli minare', 'yivliminare'],
    },
    // Konyaaltı Parkı record, on the beach.
    {
      name: 'Konyaaltı Plajı',
      district: 'Konyaaltı',
      kind: 'area',
      lat: 36.8632,
      lng: 30.6379,
      aliases: ['konyaalti plaji', 'konyaalti sahili', 'konyaalti sahil'],
    },
    {
      name: 'Lara Plajı',
      district: 'Muratpaşa',
      kind: 'area',
      lat: 36.847,
      lng: 30.793,
      aliases: ['lara plaji', 'lara halk plaji', 'lara sahili'],
    },
    {
      name: 'Antalya Havalimanı',
      district: 'Muratpaşa',
      kind: 'landmark',
      lat: 36.8987,
      lng: 30.8005,
      aliases: ['havalimani', 'havaalani', 'antalya havalimani', 'antalya airport', 'airport'],
    },
    {
      name: 'Işıklar Caddesi',
      district: 'Muratpaşa',
      kind: 'area',
      lat: 36.8892,
      lng: 30.7105,
      aliases: ['isiklar', 'isiklar caddesi'],
    },
    // Antalya Arkeoloji Müzesi record.
    {
      name: 'Antalya Müzesi',
      district: 'Konyaaltı',
      kind: 'landmark',
      lat: 36.8858,
      lng: 30.6795,
      aliases: ['antalya muzesi', 'arkeoloji muzesi', 'antalya arkeoloji muzesi'],
    },
    {
      name: 'Aspendos Antik Tiyatrosu',
      district: 'Serik',
      kind: 'landmark',
      lat: 36.9389,
      lng: 31.1722,
      aliases: ['aspendos', 'aspendos antik tiyatro'],
    },
    // 5M Migros Antalya record (the city's big Migros mall; "Migros" alone is a Kemer shop).
    {
      name: '5M Migros AVM',
      district: 'Konyaaltı',
      kind: 'landmark',
      lat: 36.8826,
      lng: 30.6597,
      aliases: ['migros', 'migros avm', '5m migros'],
    },
    {
      name: 'Kleopatra Plajı',
      district: 'Alanya',
      kind: 'area',
      lat: 36.5465,
      lng: 31.985,
      aliases: ['kleopatra plaji', 'kleopatra'],
    },
  ],
};
