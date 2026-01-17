import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { collection, getDocs, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle, CheckCircle, Loader2, ArrowLeft, Shield } from 'lucide-react';
import { Link } from 'wouter';

interface MigrationLog {
  type: 'info' | 'success' | 'error' | 'warning';
  message: string;
}

export default function Migration() {
  const { user } = useAuth();
  const [isRunning, setIsRunning] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [logs, setLogs] = useState<MigrationLog[]>([]);
  
  const [isClaimsRunning, setIsClaimsRunning] = useState(false);
  const [isClaimsComplete, setIsClaimsComplete] = useState(false);
  const [claimsLogs, setClaimsLogs] = useState<MigrationLog[]>([]);

  const addLog = (type: MigrationLog['type'], message: string) => {
    setLogs(prev => [...prev, { type, message }]);
  };

  const addClaimsLog = (type: MigrationLog['type'], message: string) => {
    setClaimsLogs(prev => [...prev, { type, message }]);
  };

  const runCustomClaimsSync = async () => {
    if (!user || user.role !== 'super_admin') {
      addClaimsLog('error', '권한이 없습니다. super_admin만 실행할 수 있습니다.');
      return;
    }

    setIsClaimsRunning(true);
    setClaimsLogs([]);
    addClaimsLog('info', 'Custom Claims 동기화 시작...');

    try {
      const usersRef = collection(db, 'users');
      const snapshot = await getDocs(usersRef);
      
      addClaimsLog('info', `총 ${snapshot.size}개의 사용자 발견`);

      const usersToSync: Array<{ uid: string; role: string; team_id?: string | null }> = [];

      for (const docSnap of snapshot.docs) {
        const data = docSnap.data();
        const uid = data.uid || docSnap.id;
        const role = data.role || 'staff';
        const team_id = data.team_id || null;

        usersToSync.push({ uid, role, team_id });
        addClaimsLog('info', `[${data.email || uid}] role: ${role}, team_id: ${team_id || 'N/A'}`);
      }

      addClaimsLog('info', '서버에 동기화 요청 중...');

      const response = await fetch('/api/admin/sync-all-claims', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ users: usersToSync }),
      });

      const result = await response.json();

      if (result.success) {
        addClaimsLog('success', `동기화 완료! 성공: ${result.results.success}건, 실패: ${result.results.failed}건`);
        
        if (result.results.errors?.length > 0) {
          result.results.errors.forEach((err: string) => {
            addClaimsLog('error', err);
          });
        }
        
        setIsClaimsComplete(true);
      } else {
        addClaimsLog('error', `동기화 실패: ${result.error}`);
      }
    } catch (error) {
      addClaimsLog('error', `오류 발생: ${error}`);
    } finally {
      setIsClaimsRunning(false);
    }
  };

  const runMigration = async () => {
    if (!user || user.role !== 'super_admin') {
      addLog('error', '권한이 없습니다. super_admin만 실행할 수 있습니다.');
      return;
    }

    setIsRunning(true);
    setLogs([]);
    addLog('info', '마이그레이션 시작...');

    try {
      const usersRef = collection(db, 'users');
      const snapshot = await getDocs(usersRef);
      
      addLog('info', `총 ${snapshot.size}개의 사용자 문서 발견`);

      let migrated = 0;
      let skipped = 0;
      let errors = 0;

      for (const docSnap of snapshot.docs) {
        const data = docSnap.data();
        const currentDocId = docSnap.id;
        const uid = data.uid;

        if (!uid) {
          addLog('warning', `[${data.email || currentDocId}] uid 필드가 없어서 건너뜀`);
          skipped++;
          continue;
        }

        if (currentDocId === uid) {
          addLog('info', `[${data.email}] 이미 UID가 문서 ID와 동일 - 건너뜀`);
          skipped++;
          continue;
        }

        try {
          const newDocRef = doc(db, 'users', uid);
          await setDoc(newDocRef, data);
          addLog('success', `[${data.email}] 새 문서 생성됨 (ID: ${uid})`);
          migrated++;
        } catch (err) {
          addLog('error', `[${data.email}] 마이그레이션 실패: ${err}`);
          errors++;
        }
      }

      addLog('info', '---');
      addLog('success', `마이그레이션 완료!`);
      addLog('info', `성공: ${migrated}개, 건너뜀: ${skipped}개, 실패: ${errors}개`);
      
      if (migrated > 0) {
        addLog('warning', '이전 문서들은 그대로 유지됩니다. 정상 작동 확인 후 수동으로 삭제하세요.');
      }

      setIsComplete(true);
    } catch (error) {
      addLog('error', `마이그레이션 오류: ${error}`);
    } finally {
      setIsRunning(false);
    }
  };

  if (!user || user.role !== 'super_admin') {
    return (
      <div className="flex items-center justify-center min-h-screen p-4">
        <Alert variant="destructive" className="max-w-md">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            권한이 없습니다. super_admin만 접근할 수 있습니다.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-2xl mx-auto space-y-6">
        <Link href="/">
          <Button variant="ghost" size="sm" data-testid="button-back">
            <ArrowLeft className="h-4 w-4 mr-2" />
            대시보드로 돌아가기
          </Button>
        </Link>

        <Card>
          <CardHeader>
            <CardTitle>사용자 문서 마이그레이션</CardTitle>
            <CardDescription>
              users 컬렉션의 문서 ID를 Firebase Auth UID로 변경합니다.
              이 작업은 보안 규칙 적용을 위해 필요합니다.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                <strong>중요:</strong> 실행 전 Firestore 데이터를 백업하세요.
                기존 문서는 삭제되지 않으며, 새 문서만 생성됩니다.
              </AlertDescription>
            </Alert>

            <Button 
              onClick={runMigration} 
              disabled={isRunning || isComplete}
              className="w-full"
              data-testid="button-run-migration"
            >
              {isRunning ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  마이그레이션 진행 중...
                </>
              ) : isComplete ? (
                <>
                  <CheckCircle className="h-4 w-4 mr-2" />
                  마이그레이션 완료
                </>
              ) : (
                '마이그레이션 실행'
              )}
            </Button>

            {logs.length > 0 && (
              <div className="bg-muted rounded-md p-4 max-h-96 overflow-y-auto font-mono text-sm space-y-1">
                {logs.map((log, index) => (
                  <div 
                    key={index}
                    className={
                      log.type === 'error' ? 'text-destructive' :
                      log.type === 'success' ? 'text-green-600 dark:text-green-400' :
                      log.type === 'warning' ? 'text-yellow-600 dark:text-yellow-400' :
                      'text-muted-foreground'
                    }
                  >
                    {log.message}
                  </div>
                ))}
              </div>
            )}

            {isComplete && (
              <Alert className="border-green-500">
                <CheckCircle className="h-4 w-4 text-green-500" />
                <AlertDescription>
                  마이그레이션이 완료되었습니다. 
                  정상 작동 확인 후 Firebase Console에서 보안 규칙을 적용하세요.
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Custom Claims 동기화
            </CardTitle>
            <CardDescription>
              Firebase Auth에 사용자 역할(role)을 설정합니다.
              이를 통해 Firestore 보안 규칙에서 역할 기반 접근 제어가 가능합니다.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                <strong>사전 조건:</strong> FIREBASE_SERVICE_ACCOUNT 환경 변수가 설정되어 있어야 합니다.
                Firebase Console에서 서비스 계정 JSON을 다운로드하여 설정하세요.
              </AlertDescription>
            </Alert>

            <Button 
              onClick={runCustomClaimsSync} 
              disabled={isClaimsRunning}
              className="w-full"
              variant={isClaimsComplete ? "outline" : "default"}
              data-testid="button-sync-claims"
            >
              {isClaimsRunning ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  동기화 진행 중...
                </>
              ) : isClaimsComplete ? (
                <>
                  <CheckCircle className="h-4 w-4 mr-2" />
                  다시 동기화
                </>
              ) : (
                'Custom Claims 동기화 실행'
              )}
            </Button>

            {claimsLogs.length > 0 && (
              <div className="bg-muted rounded-md p-4 max-h-96 overflow-y-auto font-mono text-sm space-y-1">
                {claimsLogs.map((log, index) => (
                  <div 
                    key={index}
                    className={
                      log.type === 'error' ? 'text-destructive' :
                      log.type === 'success' ? 'text-green-600 dark:text-green-400' :
                      log.type === 'warning' ? 'text-yellow-600 dark:text-yellow-400' :
                      'text-muted-foreground'
                    }
                  >
                    {log.message}
                  </div>
                ))}
              </div>
            )}

            {isClaimsComplete && (
              <Alert className="border-green-500">
                <CheckCircle className="h-4 w-4 text-green-500" />
                <AlertDescription>
                  Custom Claims 동기화가 완료되었습니다.
                  사용자가 로그아웃 후 다시 로그인하면 새 역할이 적용됩니다.
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
