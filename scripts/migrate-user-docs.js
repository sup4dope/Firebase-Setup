/**
 * Firebase Users Collection Migration Script
 * 
 * 이 스크립트는 Firebase Console에서 실행해야 합니다.
 * 
 * 사용 방법:
 * 1. Firebase Console (https://console.firebase.google.com) 접속
 * 2. 프로젝트 선택 → Firestore Database 클릭
 * 3. 브라우저 개발자 도구 열기 (F12)
 * 4. Console 탭에서 아래 코드를 붙여넣고 실행
 * 
 * 주의: 실행 전 반드시 Firestore 데이터를 백업하세요!
 */

// Firebase Console에서 실행할 코드
async function migrateUserDocuments() {
  const db = firebase.firestore();
  const usersCollection = db.collection('users');
  
  console.log('🚀 마이그레이션 시작...');
  
  // 1. 모든 users 문서 가져오기
  const snapshot = await usersCollection.get();
  console.log(`📊 총 ${snapshot.size}개의 사용자 문서 발견`);
  
  const results = {
    success: [],
    skipped: [],
    failed: []
  };
  
  for (const doc of snapshot.docs) {
    const data = doc.data();
    const oldDocId = doc.id;
    const uid = data.uid;
    
    // uid가 없으면 건너뛰기
    if (!uid) {
      console.warn(`⚠️ ${oldDocId}: uid 필드 없음 (이메일: ${data.email}) - 건너뜀`);
      results.skipped.push({ oldDocId, email: data.email, reason: 'uid 없음' });
      continue;
    }
    
    // 이미 문서 ID가 uid와 같으면 건너뛰기
    if (oldDocId === uid) {
      console.log(`✅ ${oldDocId}: 이미 uid와 일치 - 건너뜀`);
      results.skipped.push({ oldDocId, email: data.email, reason: '이미 일치' });
      continue;
    }
    
    try {
      // 새 문서 ID (uid)로 문서 생성
      await usersCollection.doc(uid).set(data);
      console.log(`📝 ${data.email}: 새 문서 생성 완료 (${oldDocId} → ${uid})`);
      
      // 기존 문서 삭제
      await usersCollection.doc(oldDocId).delete();
      console.log(`🗑️ ${data.email}: 기존 문서 삭제 완료`);
      
      results.success.push({ oldDocId, newDocId: uid, email: data.email });
    } catch (error) {
      console.error(`❌ ${data.email}: 마이그레이션 실패 -`, error);
      results.failed.push({ oldDocId, email: data.email, error: error.message });
    }
  }
  
  console.log('\n========== 마이그레이션 결과 ==========');
  console.log(`✅ 성공: ${results.success.length}건`);
  console.log(`⏭️ 건너뜀: ${results.skipped.length}건`);
  console.log(`❌ 실패: ${results.failed.length}건`);
  
  if (results.failed.length > 0) {
    console.log('\n실패 목록:');
    results.failed.forEach(f => console.log(`  - ${f.email}: ${f.error}`));
  }
  
  return results;
}

// 실행
migrateUserDocuments().then(results => {
  console.log('\n🎉 마이그레이션 완료!');
  console.log('이제 앱 코드를 업데이트하고 Firebase 규칙을 적용하세요.');
});
