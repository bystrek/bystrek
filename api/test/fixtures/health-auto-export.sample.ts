// A Health Auto Export push in the shape of its JSON export docs
// (help.healthyapps.dev/en/health-auto-export/export-format): REST API automation, export
// version 2, "Summarize Data" on. Values are made up.
export const healthAutoExportSample = {
  data: {
    metrics: [
      {
        name: 'sleep_analysis',
        units: 'hr',
        data: [
          {
            date: '2026-11-10 00:00:00 +0100',
            totalSleep: 7.2,
            asleep: 0,
            core: 3.9,
            deep: 1.1,
            rem: 2.2,
            sleepStart: '2026-11-09 23:30:00 +0100',
            sleepEnd: '2026-11-10 07:00:00 +0100',
            inBed: 7.6,
            inBedStart: '2026-11-09 23:20:00 +0100',
            inBedEnd: '2026-11-10 07:05:00 +0100',
            awake: 0.3,
            source: 'Apple Watch',
          },
        ],
      },
      {
        name: 'weight_body_mass',
        units: 'kg',
        data: [
          { date: '2026-11-10 07:15:00 +0100', qty: 72.43, source: 'Withings' },
          { date: '2026-11-11 07:20:00 +0100', qty: 72.1, source: 'Withings' },
        ],
      },
      {
        name: 'step_count',
        units: 'count',
        data: [{ date: '2026-11-10 00:00:00 +0100', qty: 8423, source: 'iPhone' }],
      },
    ],
    workouts: [
      {
        id: '550e8400-e29b-41d4-a716-446655440000',
        name: 'Traditional Strength Training',
        start: '2026-11-10 18:00:00 +0100',
        end: '2026-11-10 19:05:00 +0100',
        duration: 3900,
        activeEnergyBurned: { qty: 312.6, units: 'kcal' },
        totalEnergy: { qty: 420, units: 'kcal' },
        location: 'Indoor',
        isIndoor: true,
        heartRate: {
          min: { qty: 88, units: 'count/min' },
          avg: { qty: 121, units: 'count/min' },
          max: { qty: 162, units: 'count/min' },
        },
        metadata: {},
      },
    ],
    medications: [
      {
        displayText: 'Creatine Monohydrate',
        nickname: 'Creatine',
        start: '2026-11-10 08:30:00 +0100',
        status: 'Taken',
        isArchived: false,
        dosage: 5,
        units: 'g',
        codings: [],
      },
      {
        displayText: 'Vitamin D3',
        start: '2026-11-10 08:30:00 +0100',
        scheduledDate: '2026-11-10 08:00:00 +0100',
        status: 'Skipped',
        isArchived: false,
        units: 'capsule',
        codings: [],
      },
    ],
  },
};
