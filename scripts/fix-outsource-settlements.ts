/**
 * 소급 보정: entry_source='외주' 정산 중 deposit_commission_rate가 0/누락이거나
 * gross_commission이 outsource 수당율 기준 기대값과 다른 항목을 점검 + 재계산.
 *
 * 적용:
 *   DRY_RUN=1 tsx scripts/fix-outsource-settlements.ts (조회만)
 *   APPLY=1   tsx scripts/fix-outsource-settlements.ts (수정 적용)
 */
import admin from 'firebase-admin';

const APPLY = process.env.APPLY === '1';

const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT!);
admin.initializeApp({ credential: admin.credential.cert(sa), projectId: sa.project_id });
const db = admin.firestore();

(async () => {
  const usersSnap = await db.collection('users').get();
  const users = new Map<string, any>();
  usersSnap.forEach(d => {
    const u = d.data();
    if (u.uid) users.set(u.uid, u);
  });

  const sSnap = await db.collection('settlements').where('entry_source', '==', '외주').get();
  console.log(`외주 정산 총 ${sSnap.size}건 점검 중...`);

  let needsFix = 0;
  let fixed = 0;
  const updates: Array<{id: string; before: any; after: any; reason: string}> = [];

  for (const docSnap of sSnap.docs) {
    const s: any = docSnap.data();
    if (s.is_clawback || s.status !== '정상') continue;

    const manager = users.get(s.manager_id);
    const outRate = manager?.commissionRates?.outsource || 0;
    if (!outRate) continue;

    const contractAmount = s.contract_amount || 0;
    const executionAmount = s.execution_amount || 0;
    const feeRate = s.fee_rate || 0;
    const isReExecution = (s.org_name || '').includes('(재집행)');

    // 외주는 계약금/자문료 모두 outsource율 적용 (재집행 항목은 reExecution율)
    const reExecRate = manager?.commissionRates?.reExecution || 0;
    const expectedCommissionRate = isReExecution ? reExecRate : outRate;
    const expectedDepositRate = isReExecution ? 0 : outRate;

    const advisoryFee = executionAmount * feeRate / 100;
    const totalRevenue = contractAmount + advisoryFee;
    const contractCommission = contractAmount * expectedDepositRate / 100;
    const advisoryCommission = advisoryFee * expectedCommissionRate / 100;
    const expectedGross = contractCommission + advisoryCommission;
    const expectedTax = Math.round(expectedGross * 0.033 * 100) / 100;
    const expectedNet = Math.round((expectedGross - expectedTax) * 100) / 100;

    const drift =
      (s.commission_rate || 0) !== expectedCommissionRate ||
      (s.deposit_commission_rate || 0) !== expectedDepositRate ||
      Math.abs((s.gross_commission || 0) - expectedGross) > 0.01 ||
      Math.abs((s.total_revenue || 0) - totalRevenue) > 0.01;

    if (!drift) continue;
    needsFix++;

    const after = {
      commission_rate: expectedCommissionRate,
      deposit_commission_rate: expectedDepositRate,
      total_revenue: totalRevenue,
      gross_commission: Math.round(expectedGross * 100) / 100,
      tax_amount: expectedTax,
      net_commission: expectedNet,
    };
    updates.push({
      id: docSnap.id,
      before: {
        customer_name: s.customer_name,
        manager_name: s.manager_name,
        org_name: s.org_name,
        commission_rate: s.commission_rate,
        deposit_commission_rate: s.deposit_commission_rate,
        gross_commission: s.gross_commission,
        total_revenue: s.total_revenue,
      },
      after,
      reason: `outsource율=${outRate}% 기준 재계산`,
    });

    if (APPLY) {
      await docSnap.ref.update({ ...after, updated_at: admin.firestore.FieldValue.serverTimestamp() });
      fixed++;
    }
  }

  console.log(`\n=== 점검 결과 ===`);
  console.log(`총 점검: ${sSnap.size}건, 보정 대상: ${needsFix}건${APPLY ? `, 실제 적용: ${fixed}건` : ' (DRY_RUN)'}`);
  console.log(`\n=== 상세 ===`);
  for (const u of updates) {
    console.log(`\n[${u.id}] ${u.before.customer_name} (${u.before.manager_name}) ${u.before.org_name || ''}`);
    console.log(`  before: commission_rate=${u.before.commission_rate}, deposit_commission_rate=${u.before.deposit_commission_rate}, gross=${u.before.gross_commission}, revenue=${u.before.total_revenue}`);
    console.log(`  after:  commission_rate=${u.after.commission_rate}, deposit_commission_rate=${u.after.deposit_commission_rate}, gross=${u.after.gross_commission}, revenue=${u.after.total_revenue}`);
  }
  process.exit(0);
})();
