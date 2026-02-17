import admin from 'firebase-admin';
import type { Request, Response, NextFunction } from 'express';

let adminApp: admin.app.App | null = null;

export interface AuthenticatedRequest extends Request {
  user?: admin.auth.DecodedIdToken;
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: '인증 토큰이 필요합니다.' });
  }

  const idToken = authHeader.split('Bearer ')[1];
  const app = getAdminApp();

  app.auth().verifyIdToken(idToken)
    .then(decodedToken => {
      req.user = decodedToken;
      next();
    })
    .catch(error => {
      console.error('토큰 검증 실패:', error.message);
      return res.status(401).json({ success: false, error: '유효하지 않은 인증 토큰입니다.' });
    });
}

export function requireSuperAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ success: false, error: '인증이 필요합니다.' });
  }
  if (req.user.role !== 'super_admin') {
    return res.status(403).json({ success: false, error: '관리자 권한이 필요합니다.' });
  }
  next();
}

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

export async function setUserCustomClaims(uid: string, role: string, teamId?: string | null): Promise<void> {
  const app = getAdminApp();
  const auth = app.auth();
  
  const claims: { role: string; team_id?: string } = { role };
  if (teamId) {
    claims.team_id = teamId;
  }
  
  await auth.setCustomUserClaims(uid, claims);
  console.log(`✅ Custom claim 설정 완료: ${uid} -> role: ${role}, team_id: ${teamId || 'N/A'}`);
}

export async function getUserCustomClaims(uid: string): Promise<{ role?: string; team_id?: string } | null> {
  const app = getAdminApp();
  const auth = app.auth();
  
  try {
    const user = await auth.getUser(uid);
    return user.customClaims as { role?: string; team_id?: string } || null;
  } catch (error) {
    console.error('사용자 조회 실패:', error);
    return null;
  }
}

export async function syncAllUserClaims(users: Array<{ uid: string; role: string; team_id?: string | null }>): Promise<{
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
      await setUserCustomClaims(user.uid, user.role, user.team_id);
      results.success++;
    } catch (error: any) {
      results.failed++;
      results.errors.push(`${user.uid}: ${error.message}`);
    }
  }

  return results;
}
