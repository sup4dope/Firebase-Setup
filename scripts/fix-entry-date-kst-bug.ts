/**
 * 소급 보정 스크립트: KST 새벽(UTC 5/6 15:00 ~ 5/7 00:00) 시간대에 분배되어
 * entry_date가 '2026-05-06'으로 잘못 저장된 고객을 찾아 '2026-05-07'로 수정.
 *
 * 영향 케이스:
 *   A) 신규 고객 (firestore.ts:2998): created_at이 버그 시간대에 들어가고 entry_date='2026-05-06'
 *   B) 기존 고객 재분배 (firestore.ts:2937): updated_at이 버그 시간대에 들어가고 entry_date='2026-05-06'
 *
 * 실행: DRY_RUN=1 tsx scripts/fix-entry-date-kst-bug.ts  (조회만)
 *       APPLY=1   tsx scripts/fix-entry-date-kst-bug.ts  (수정 적용)
 */
import admin from 'firebase-admin';

const APPLY = process.env.APPLY === '1';
const DRY_RUN = !APPLY;

const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!serviceAccountJson) {
  console.error('❌ FIREBASE_SERVICE_ACCOUNT 환경 변수가 설정되지 않았습니다.');
  process.exit(1);
}

const serviceAccount = JSON.parse(serviceAccountJson);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount as admin.ServiceAccount),
  projectId: serviceAccount.project_id,
});

const db = admin.firestore();

// 버그 윈도우: KST 5/7 00:00:00 ~ 5/7 09:00:00 = UTC 5/6 15:00:00 ~ 5/7 00:00:00
const BUG_START_UTC = new Date('2026-05-06T15:00:00.000Z');
const BUG_END_UTC = new Date('2026-05-07T00:00:00.000Z');
const WRONG_DATE = '2026-05-06';
const CORRECT_DATE = '2026-05-07';

function fmtKst(d: Date): string {
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).format(d);
}

async function main() {
  console.log('==============================================');
  console.log(`모드: ${DRY_RUN ? '🔍 DRY-RUN (조회만)' : '✏️  APPLY (실제 수정)'}`);
  console.log(`버그 윈도우(UTC): ${BUG_START_UTC.toISOString()} ~ ${BUG_END_UTC.toISOString()}`);
  console.log(`             KST: 2026-05-07 00:00:00 ~ 2026-05-07 09:00:00`);
  console.log(`잘못 저장된 entry_date: ${WRONG_DATE}  →  보정값: ${CORRECT_DATE}`);
  console.log('==============================================\n');

  // entry_date='2026-05-06'인 고객 전수 조회 (소량 가정)
  const snap = await db.collection('customers').where('entry_date', '==', WRONG_DATE).get();
  console.log(`📊 entry_date='${WRONG_DATE}' 고객 수: ${snap.size}\n`);

  const startMs = BUG_START_UTC.getTime();
  const endMs = BUG_END_UTC.getTime();

  type Affected = {
    id: string;
    name: string;
    company: string;
    case: 'A_신규' | 'B_재분배';
    signal_at_utc: string;
    signal_at_kst: string;
    manager_name: string;
    status_code: string;
  };
  const affected: Affected[] = [];

  for (const doc of snap.docs) {
    const data = doc.data() as any;
    const createdAt: admin.firestore.Timestamp | undefined = data.created_at;
    const updatedAt: admin.firestore.Timestamp | undefined = data.updated_at;
    const createdMs = createdAt?.toMillis?.() ?? null;
    const updatedMs = updatedAt?.toMillis?.() ?? null;

    let kase: 'A_신규' | 'B_재분배' | null = null;
    let signalMs: number | null = null;

    if (createdMs !== null && createdMs >= startMs && createdMs < endMs) {
      kase = 'A_신규';
      signalMs = createdMs;
    } else if (
      updatedMs !== null && updatedMs >= startMs && updatedMs < endMs &&
      (createdMs === null || createdMs < startMs)
    ) {
      kase = 'B_재분배';
      signalMs = updatedMs;
    }

    if (kase && signalMs !== null) {
      const d = new Date(signalMs);
      affected.push({
        id: doc.id,
        name: data.name || '',
        company: data.company_name || '',
        case: kase,
        signal_at_utc: d.toISOString(),
        signal_at_kst: fmtKst(d),
        manager_name: data.manager_name || '',
        status_code: data.status_code || '',
      });
    }
  }

  console.log(`🎯 영향 고객(소급 대상): ${affected.length}명\n`);
  if (affected.length === 0) {
    console.log('✅ 보정 대상 없음. 종료.');
    return;
  }

  console.log('--- 영향 고객 목록 ---');
  affected.forEach((a, i) => {
    console.log(
      `${(i + 1).toString().padStart(2, '0')}. [${a.case}] ${a.name} (${a.company}) ` +
      `| 담당:${a.manager_name} | 상태:${a.status_code}\n` +
      `     id=${a.id}\n` +
      `     신호 시각(KST): ${a.signal_at_kst}  (UTC: ${a.signal_at_utc})`
    );
  });
  console.log('');

  if (DRY_RUN) {
    console.log('🔍 DRY-RUN 종료. 실제 적용하려면 APPLY=1 환경변수로 재실행하세요.');
    return;
  }

  // ===== APPLY =====
  console.log('✏️  보정 적용 시작...\n');
  const batch = db.batch();
  let count = 0;
  for (const a of affected) {
    const ref = db.collection('customers').doc(a.id);
    batch.update(ref, {
      entry_date: CORRECT_DATE,
      updated_at: admin.firestore.Timestamp.now(),
    });
    count++;
  }
  await batch.commit();
  console.log(`✅ ${count}건의 entry_date를 '${WRONG_DATE}' → '${CORRECT_DATE}'로 보정 완료.`);

  // 이력 로그 추가 (감사 추적)
  console.log('\n📝 customer_history_logs에 보정 이력 기록 중...');
  const logBatch = db.batch();
  for (const a of affected) {
    const logRef = db.collection('customer_history_logs').doc();
    logBatch.set(logRef, {
      customer_id: a.id,
      action_type: 'info_update',
      field: 'entry_date',
      old_value: WRONG_DATE,
      new_value: CORRECT_DATE,
      changed_by_id: 'system',
      changed_by_name: 'KST 시간대 버그 소급 보정 스크립트',
      changed_at: admin.firestore.Timestamp.now(),
      note: `자동 보정: KST 새벽 시간대 분배 버그(UTC 기준 toISOString 사용)로 인해 잘못 저장된 ${WRONG_DATE} → ${CORRECT_DATE}. 케이스=${a.case}, 신호시각(KST)=${a.signal_at_kst}.`,
    });
  }
  await logBatch.commit();
  console.log(`✅ ${affected.length}건의 보정 이력 기록 완료.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ 스크립트 실행 실패:', err);
    process.exit(1);
  });
