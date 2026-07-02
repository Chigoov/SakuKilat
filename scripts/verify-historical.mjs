/**
 * SakuKilat - verifikasi ringan untuk fungsi murni.
 *
 * Cara jalankan:
 *   1. npx --no-install tsc lib/historical-achievements.ts lib/notification-plan.ts lib/stats.ts \
 *        --module esnext --target es2020 --moduleResolution bundler \
 *        --skipLibCheck --outDir scripts/.verify-build
 *   2. node scripts/verify-historical.mjs
 */

import { readFile, writeFile } from 'node:fs/promises'

const notificationPlanUrl = new URL('./.verify-build/notification-plan.js', import.meta.url)
const notificationPlanSource = await readFile(notificationPlanUrl, 'utf8')
if (notificationPlanSource.includes("from './stats'")) {
  await writeFile(
    notificationPlanUrl,
    notificationPlanSource.replace("from './stats'", "from './stats.js'"),
  )
}

const {
  evaluateHistoricalFlags,
  needsRollover,
  dayKey,
} = await import('./.verify-build/historical-achievements.js')
const {
  buildNotificationPlan,
  SCHEDULED_BASE_ID,
  MAX_SCHEDULED,
} = await import('./.verify-build/notification-plan.js')

const K = (name) => `sakukilat:v2:${name}`
const TUTUP_AMAN = K('ach-tutup-aman')
const UNDER50 = K('ach-under50')
const UNDER25 = K('ach-under25')
const SURPLUS = K('ach-surplus')
const NOSKIP = K('ach-noskip')
const PUASA = K('ach-puasa')
const WEEKEND = K('ach-weekend-hemat')
const SURVIVOR = K('ach-survivor')

let failures = 0
let currentProp = ''

function prop(name, fn) {
  currentProp = name
  const before = failures
  try {
    fn()
  } catch (err) {
    failures += 1
    console.log(`  [THROW] ${currentProp}: ${err && err.stack ? err.stack : err}`)
  }
  console.log(`${failures === before ? 'PASS' : 'FAIL'}  ${name}`)
}

function assert(cond, msg) {
  if (!cond) {
    failures += 1
    console.log(`  [x] ${msg}`)
  }
}

const has = (arr, flag) => Array.isArray(arr) && arr.includes(flag)
const sorted = (arr) => [...arr].sort()
const eqSet = (a, b) =>
  a.length === b.length && JSON.stringify(sorted(a)) === JSON.stringify(sorted(b))
const isSuperset = (big, small) => small.every((x) => big.includes(x))
const normalizePlan = (plan) =>
  plan.map((item) => ({
    id: item.id,
    title: item.title,
    body: item.body,
    at: item.at.getTime(),
  }))

let idCounter = 0
function tx(date, type, amount, kind) {
  idCounter += 1
  return {
    id: `t-${idCounter}`,
    description: `tx-${idCounter}`,
    amount,
    type,
    category: type === 'income' ? 'gaji' : 'makanan',
    paymentMethod: 'tunai',
    ...(kind ? { kind } : {}),
    date,
  }
}

const NOW = new Date(2026, 5, 15, 10, 0, 0)

prop('Property 3: anti false-positive (data kosong & pengguna baru)', () => {
  const empty = evaluateHistoricalFlags({
    transactions: [],
    monthlyBudget: 0,
    zenMode: false,
    now: NOW,
  })
  assert(Array.isArray(empty) && empty.length === 0, `data kosong harus [], dapat ${JSON.stringify(empty)}`)

  const newUser = evaluateHistoricalFlags({
    transactions: [
      tx(new Date(2026, 5, 13), 'expense', 25_000),
      tx(new Date(2026, 5, 14), 'expense', 30_000),
    ],
    monthlyBudget: 1_000_000,
    zenMode: false,
    now: NOW,
  })
  assert(!has(newUser, PUASA), `pengguna baru tidak boleh puasa, dapat ${JSON.stringify(newUser)}`)
  assert(!has(newUser, WEEKEND), `pengguna baru tidak boleh weekend-hemat, dapat ${JSON.stringify(newUser)}`)
  assert(!has(newUser, NOSKIP), `pengguna baru tidak boleh noskip, dapat ${JSON.stringify(newUser)}`)
  assert(!has(newUser, SURVIVOR), `pengguna baru tidak boleh survivor, dapat ${JSON.stringify(newUser)}`)
})

prop('Positive dataset: ach-tutup-aman / ach-under50 / ach-surplus muncul', () => {
  const flags = evaluateHistoricalFlags({
    transactions: [
      tx(new Date(2026, 4, 5), 'income', 5_000_000),
      tx(new Date(2026, 4, 10), 'expense', 100_000),
    ],
    monthlyBudget: 1_000_000,
    zenMode: false,
    now: NOW,
  })
  assert(has(flags, TUTUP_AMAN), `harus ada ach-tutup-aman, dapat ${JSON.stringify(flags)}`)
  assert(has(flags, UNDER50), `harus ada ach-under50, dapat ${JSON.stringify(flags)}`)
  assert(has(flags, SURPLUS), `harus ada ach-surplus, dapat ${JSON.stringify(flags)}`)
})

prop('Property 5: needsRollover null/sama/beda hari', () => {
  assert(needsRollover(null, NOW) === true, 'needsRollover(null, now) harus true')
  assert(needsRollover(dayKey(NOW), NOW) === false, 'needsRollover(dayKey(now), now) harus false')
  const otherDay = new Date(2026, 5, 14)
  assert(
    needsRollover(dayKey(otherDay), NOW) === true,
    `beda hari harus true (last=${dayKey(otherDay)}, now=${dayKey(NOW)})`,
  )
})

prop('Property 1: evaluasi idempoten (dua panggilan identik)', () => {
  const input = {
    transactions: [
      tx(new Date(2026, 4, 5), 'income', 5_000_000),
      tx(new Date(2026, 4, 10), 'expense', 100_000),
      tx(new Date(2026, 3, 22), 'expense', 5_000),
    ],
    monthlyBudget: 1_000_000,
    zenMode: false,
    now: NOW,
  }
  const a = evaluateHistoricalFlags(input)
  const b = evaluateHistoricalFlags(input)
  assert(eqSet(a, b), `dua panggilan harus identik: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`)
})

prop('Property 2: monotonisitas flag pada superset transaksi', () => {
  const baseTxs = [tx(new Date(2026, 4, 10), 'expense', 100_000)]
  const A = {
    transactions: baseTxs,
    monthlyBudget: 1_000_000,
    zenMode: false,
    now: NOW,
  }
  const B = {
    transactions: [...baseTxs, tx(new Date(2026, 4, 5), 'income', 5_000_000)],
    monthlyBudget: 1_000_000,
    zenMode: false,
    now: NOW,
  }
  const fa = evaluateHistoricalFlags(A)
  const fb = evaluateHistoricalFlags(B)
  assert(
    isSuperset(fb, fa),
    `flags(B) harus superset flags(A): A=${JSON.stringify(fa)} B=${JSON.stringify(fb)}`,
  )
  assert(has(fb, SURPLUS), `B harus memunculkan surplus, dapat ${JSON.stringify(fb)}`)
})

prop('Property 6: totalitas (input ekstrem tidak melempar)', () => {
  let res
  let threw = false
  try {
    res = evaluateHistoricalFlags({
      transactions: [
        tx(new Date(2027, 0, 1), 'expense', 50_000),
        tx(new Date(2026, 4, 10), 'expense', 0),
        tx(new Date(2026, 4, 11), 'income', -100),
      ],
      monthlyBudget: 1_000_000,
      zenMode: false,
      now: NOW,
    })
  } catch {
    threw = true
  }
  assert(!threw, 'input ekstrem tidak boleh melempar')
  assert(Array.isArray(res), 'output tetap array untuk input ekstrem')

  let invalidRes
  let invalidThrew = false
  try {
    invalidRes = evaluateHistoricalFlags({
      transactions: [tx(new Date(2026, 4, 10), 'expense', 100_000)],
      monthlyBudget: 1_000_000,
      zenMode: false,
      now: new Date('invalid'),
    })
  } catch {
    invalidThrew = true
  }
  assert(!invalidThrew, 'Invalid Date now tidak boleh melempar')
  assert(
    Array.isArray(invalidRes) && invalidRes.length === 0,
    `Invalid Date now harus [], dapat ${JSON.stringify(invalidRes)}`,
  )
})

prop('Property 7: budget-gating saat monthlyBudget = 0', () => {
  const flags = evaluateHistoricalFlags({
    transactions: [
      tx(new Date(2026, 4, 10), 'expense', 1_000),
      tx(new Date(2026, 4, 12), 'expense', 2_000),
    ],
    monthlyBudget: 0,
    zenMode: false,
    now: NOW,
  })
  assert(!has(flags, TUTUP_AMAN), `budget 0 tidak boleh tutup-aman, dapat ${JSON.stringify(flags)}`)
  assert(!has(flags, UNDER50), `budget 0 tidak boleh under50, dapat ${JSON.stringify(flags)}`)
  assert(!has(flags, UNDER25), `budget 0 tidak boleh under25, dapat ${JSON.stringify(flags)}`)
})

prop('Property 8: rencana kosong saat notif nonaktif', () => {
  const plan = buildNotificationPlan({
    transactions: [tx(new Date(2026, 5, 14), 'expense', 20_000)],
    monthlyBudget: 1_000_000,
    goals: [],
    prefs: { enabled: false, hour: 20, minute: 0 },
    now: NOW,
  })
  assert(Array.isArray(plan) && plan.length === 0, `prefs nonaktif harus [], dapat ${JSON.stringify(plan)}`)
})

prop('Property 9: ID rencana valid, unik, dan waktu selalu di masa depan', () => {
  const plan = buildNotificationPlan({
    transactions: [
      tx(new Date(2026, 5, 13, 9, 0, 0), 'expense', 100_000),
      tx(new Date(2026, 5, 14, 9, 0, 0), 'expense', 750_000),
    ],
    monthlyBudget: 900_000,
    goals: [
      { label: 'Laptop', saved: 250_000, target: 1_000_000, deadline: '2026-06-17' },
      { label: 'Liburan', saved: 100_000, target: 600_000, deadline: '2026-06-18' },
    ],
    prefs: { enabled: true, hour: 20, minute: 0 },
    now: NOW,
    horizonDays: 14,
  })

  assert(plan.length > 0, 'plan aktif harus menghasilkan minimal satu notifikasi')
  assert(plan.length <= MAX_SCHEDULED, `jumlah notif harus <= ${MAX_SCHEDULED}, dapat ${plan.length}`)

  const ids = plan.map((item) => item.id)
  assert(new Set(ids).size === ids.length, `id notif harus unik, dapat ${JSON.stringify(ids)}`)
  assert(
    ids.every((id) => id >= SCHEDULED_BASE_ID && id < SCHEDULED_BASE_ID + MAX_SCHEDULED),
    `id notif harus di rentang ${SCHEDULED_BASE_ID}..${SCHEDULED_BASE_ID + MAX_SCHEDULED - 1}, dapat ${JSON.stringify(ids)}`,
  )
  assert(
    plan.every((item) => item.at instanceof Date && item.at.getTime() > NOW.getTime()),
    `semua waktu notif harus > now, dapat ${JSON.stringify(normalizePlan(plan))}`,
  )
})

prop('Property 10: rencana deterministik dan total pada input ekstrem', () => {
  const snapshot = {
    transactions: [tx(new Date(2026, 5, 14, 7, 0, 0), 'expense', 50_000)],
    monthlyBudget: Number.NaN,
    goals: [
      { label: 'Target A', saved: 10_000, target: 100_000, deadline: 'invalid-date' },
      { label: '', saved: 0, target: 0 },
    ],
    prefs: { enabled: true, hour: 99, minute: -5 },
    now: NOW,
    horizonDays: 99,
  }
  const a = normalizePlan(buildNotificationPlan(snapshot))
  const b = normalizePlan(buildNotificationPlan(snapshot))
  assert(JSON.stringify(a) === JSON.stringify(b), `dua panggilan harus identik: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`)

  let threw = false
  let invalidPlan
  try {
    invalidPlan = buildNotificationPlan({
      transactions: [],
      monthlyBudget: 0,
      goals: [],
      prefs: { enabled: true, hour: 20, minute: 0 },
      now: new Date('invalid'),
    })
  } catch {
    threw = true
  }
  assert(!threw, 'buildNotificationPlan tidak boleh melempar untuk input ekstrem')
  assert(
    Array.isArray(invalidPlan) && invalidPlan.length === 0,
    `Invalid Date now harus menghasilkan [], dapat ${JSON.stringify(invalidPlan)}`,
  )
})

prop('Property 11: saat aktif, pengingat harian minimal satu selalu ada', () => {
  const plan = buildNotificationPlan({
    transactions: [],
    monthlyBudget: 0,
    goals: [],
    prefs: { enabled: true, hour: 20, minute: 0 },
    now: NOW,
  })
  assert(plan.length >= 1, `plan aktif tanpa kondisi khusus tetap butuh notif harian, dapat ${JSON.stringify(plan)}`)
  assert(
    plan.some((item) => item.title === 'Waktunya catat keuangan'),
    `plan aktif harus memuat pengingat harian, dapat ${JSON.stringify(plan)}`,
  )
})

console.log('')
if (failures === 0) {
  console.log('ALL PROPERTIES PASSED ✓')
  process.exit(0)
} else {
  console.log(`FAILED: ${failures} assertion(s) gagal ✗`)
  process.exit(1)
}
