import admin from 'firebase-admin';
const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT!);
admin.initializeApp({ credential: admin.credential.cert(sa), projectId: sa.project_id });
const db = admin.firestore();

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
function kstYmd(d: Date) {
  const k = new Date(d.getTime() + KST_OFFSET_MS);
  return `${k.getUTCFullYear()}-${String(k.getUTCMonth()+1).padStart(2,'0')}-${String(k.getUTCDate()).padStart(2,'0')}`;
}
function startOfDayLocal() {
  const n = new Date();
  // 로컬(클라이언트) 0시 ≈ UTC 15:00 전일
  const d = new Date(n);
  d.setHours(0,0,0,0);
  return d;
}

(async () => {
  const usersSnap = await db.collection('users').get();
  const userMap = new Map<string,{name:string;status:string;db:boolean}>();
  usersSnap.forEach(d => {
    const u: any = d.data();
    const uid = u.uid || d.id;
    userMap.set(uid, {
      name: u.name || '(no name)',
      status: u.status || '',
      db: u.db_distribution_enabled !== false,
    });
  });

  // server local startOfDay (서버 KST일 가능성 — Replit 컨테이너 TZ 영향)
  const sodLocal = startOfDayLocal();
  console.log(`[INFO] server local startOfDay = ${sodLocal.toISOString()} (server TZ=${Intl.DateTimeFormat().resolvedOptions().timeZone})`);
  const todayKst = kstYmd(new Date());
  console.log(`[INFO] today KST = ${todayKst}`);

  // 1) created_at >= sodLocal 기준 (두 프론트 모달의 로직)
  const q1 = await db.collection('customers')
    .where('created_at', '>=', admin.firestore.Timestamp.fromDate(sodLocal))
    .get();
  const cnt1: Record<string, number> = {};
  q1.forEach(d => {
    const c: any = d.data();
    if (!c.manager_id) return;
    cnt1[c.manager_id] = (cnt1[c.manager_id] || 0) + 1;
  });

  // 2) entry_date == todayKst 기준 (실제 배정 한도 체크 로직 - getTodayAssignmentCount)
  const q2 = await db.collection('customers')
    .where('entry_date', '==', todayKst)
    .get();
  const cnt2: Record<string, number> = {};
  q2.forEach(d => {
    const c: any = d.data();
    if (!c.manager_id) return;
    cnt2[c.manager_id] = (cnt2[c.manager_id] || 0) + 1;
  });

  console.log(`\n=== 직원별 오늘 분배 수 비교 ===`);
  console.log(`[A] created_at >= startOfDay(local)  = 두 모달이 표시하는 값`);
  console.log(`[B] entry_date == ${todayKst}        = 실제 한도 체크에 쓰이는 값`);
  console.log(`────────────────────────────────────────────`);
  const allUids = new Set([...Object.keys(cnt1), ...Object.keys(cnt2)]);
  const rows: Array<{name:string;a:number;b:number;diff:number}> = [];
  for (const uid of allUids) {
    const u = userMap.get(uid);
    rows.push({
      name: u ? `${u.name}${u.status==='퇴사'?'(퇴사)':''}${!u.db?'(분배OFF)':''}` : `(미등록 uid=${uid.slice(0,6)}…)`,
      a: cnt1[uid] || 0,
      b: cnt2[uid] || 0,
      diff: (cnt1[uid]||0) - (cnt2[uid]||0),
    });
  }
  rows.sort((x,y)=> y.b - x.b || y.a - x.a);
  for (const r of rows) {
    const flag = r.diff !== 0 ? '  ⚠️  불일치' : '';
    console.log(`  ${r.name.padEnd(28)} A=${r.a}  B=${r.b}${flag}`);
  }

  console.log(`\n총 차이: A=${q1.size}건  B=${q2.size}건`);

  // 3) 차이가 있는 customer 샘플
  if (q1.size !== q2.size) {
    console.log(`\n=== A에는 있지만 B에는 없는 customer (혹은 반대) 샘플 ===`);
    const aIds = new Set<string>(); q1.forEach(d => aIds.add(d.id));
    const bIds = new Set<string>(); q2.forEach(d => bIds.add(d.id));
    const onlyA = [...aIds].filter(id => !bIds.has(id));
    const onlyB = [...bIds].filter(id => !aIds.has(id));
    for (const id of onlyA.slice(0,5)) {
      const c: any = (await db.collection('customers').doc(id).get()).data();
      console.log(`  [A only] ${id} name=${c.name} entry_date=${c.entry_date} created_at=${c.created_at?.toDate?.().toISOString?.()} mgr=${userMap.get(c.manager_id)?.name}`);
    }
    for (const id of onlyB.slice(0,5)) {
      const c: any = (await db.collection('customers').doc(id).get()).data();
      console.log(`  [B only] ${id} name=${c.name} entry_date=${c.entry_date} created_at=${c.created_at?.toDate?.().toISOString?.()} mgr=${userMap.get(c.manager_id)?.name}`);
    }
  }
  process.exit(0);
})();
