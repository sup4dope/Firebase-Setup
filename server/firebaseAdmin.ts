import admin from 'firebase-admin';

let adminApp: admin.app.App | null = null;

export function getAdminApp(): admin.app.App {
  if (adminApp) {
    return adminApp;
  }

  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
  
  if (!serviceAccountJson) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT 환경 변수가 설정되지 않았습니다.');
  }

  try {
    const serviceAccount = JSON.parse(serviceAccountJson);
    
    const credential = admin.credential.cert(serviceAccount as admin.ServiceAccount);
    
    adminApp = admin.initializeApp({
      credential,
      projectId: serviceAccount.project_id,
    });
    
    console.log('✅ Firebase Admin SDK 초기화 완료');
    return adminApp;
  } catch (error) {
    console.error('❌ Firebase Admin SDK 초기화 실패:', error);
    throw error;
  }
}

export async function setUserCustomClaims(uid: string, role: string): Promise<void> {
  const app = getAdminApp();
  const auth = app.auth();
  
  await auth.setCustomUserClaims(uid, { role });
  console.log(`✅ Custom claim 설정 완료: ${uid} -> role: ${role}`);
}

export async function getUserCustomClaims(uid: string): Promise<{ role?: string } | null> {
  const app = getAdminApp();
  const auth = app.auth();
  
  try {
    const user = await auth.getUser(uid);
    return user.customClaims as { role?: string } || null;
  } catch (error) {
    console.error('사용자 조회 실패:', error);
    return null;
  }
}

export async function syncAllUserClaims(users: Array<{ uid: string; role: string }>): Promise<{
  success: number;
  failed: number;
  errors: string[];
}> {
  const results = {
    success: 0,
    failed: 0,
    errors: [] as string[],
  };

  for (const user of users) {
    try {
      await setUserCustomClaims(user.uid, user.role);
      results.success++;
    } catch (error: any) {
      results.failed++;
      results.errors.push(`${user.uid}: ${error.message}`);
    }
  }

  return results;
}
