import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, Building2, AlertCircle } from 'lucide-react';
import { SiGoogle } from 'react-icons/si';
import { kadvice } from 'kadvice';

interface DailyAdvice {
  author: string;
  authorProfile: string;
  message: string;
}

export default function Login() {
  const { signInWithGoogle, loading } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [dailyAdvice, setDailyAdvice] = useState<DailyAdvice | null>(null);

  useEffect(() => {
    const advice = kadvice.getOneByDaily();
    setDailyAdvice(advice);
  }, []);

  const handleGoogleSignIn = async () => {
    setError(null);
    setIsSigningIn(true);
    try {
      await signInWithGoogle();
    } catch (err: any) {
      console.error('Login failed:', err);
      
      // Handle specific Firebase errors
      if (err?.code === 'auth/unauthorized-domain') {
        setError('이 도메인이 Firebase에 등록되지 않았습니다. Firebase Console > Authentication > Settings > Authorized domains에서 현재 도메인을 추가해주세요.');
      } else if (err?.code === 'auth/popup-closed-by-user') {
        setError('로그인 팝업이 닫혔습니다. 다시 시도해주세요.');
      } else if (err?.code === 'auth/popup-blocked') {
        setError('팝업이 차단되었습니다. 팝업 차단을 해제하고 다시 시도해주세요.');
      } else {
        setError(`로그인 실패: ${err?.message || '알 수 없는 오류'}`);
      }
    } finally {
      setIsSigningIn(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background">
      <Card className="w-full max-w-md mx-4">
        <CardHeader className="text-center space-y-4">
          <div className="mx-auto w-16 h-16 bg-primary rounded-lg flex items-center justify-center">
            <Building2 className="w-8 h-8 text-primary-foreground" />
          </div>
          <div className="space-y-2">
            <CardTitle className="text-2xl font-bold">경영지원그륩 이음 CRM</CardTitle>
            <CardDescription className="text-base">Management Support Group Yieum CRM</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-3 text-center">
            {dailyAdvice ? (
              <>
                <p className="text-sm text-foreground leading-relaxed italic">
                  "{dailyAdvice.message}"
                </p>
                <p className="text-xs text-muted-foreground">
                  - {dailyAdvice.author} ({dailyAdvice.authorProfile}) -
                </p>
              </>
            ) : (
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>상담부터 집행까지 체계적인 퍼널 관리</p>
                <p>영업일 기준 정교한 KPI 예측</p>
                <p>팀별 권한 관리 및 협업 지원</p>
              </div>
            )}
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>로그인 오류</AlertTitle>
              <AlertDescription className="text-sm">{error}</AlertDescription>
            </Alert>
          )}
          
          <Button
            className="w-full gap-3"
            size="lg"
            onClick={handleGoogleSignIn}
            disabled={loading || isSigningIn}
            data-testid="button-google-login"
          >
            {(loading || isSigningIn) ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                <SiGoogle className="w-5 h-5" />
                Google 계정으로 로그인
              </>
            )}
          </Button>
          
          <p className="text-xs text-center text-muted-foreground">
            로그인 시 서비스 이용약관에 동의하는 것으로 간주됩니다
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
