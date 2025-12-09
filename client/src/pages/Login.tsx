import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Building2 } from 'lucide-react';
import { SiGoogle } from 'react-icons/si';

export default function Login() {
  const { signInWithGoogle, loading } = useAuth();

  const handleGoogleSignIn = async () => {
    try {
      await signInWithGoogle();
    } catch (error) {
      console.error('Login failed:', error);
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
            <CardTitle className="text-2xl font-bold">정책자금 컨설팅 CRM</CardTitle>
            <CardDescription className="text-base">
              고객 관리 및 영업 현황을 한눈에 파악하세요
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2 text-center text-sm text-muted-foreground">
            <p>상담부터 집행까지 체계적인 퍼널 관리</p>
            <p>영업일 기준 정교한 KPI 예측</p>
            <p>팀별 권한 관리 및 협업 지원</p>
          </div>
          
          <Button
            className="w-full gap-3"
            size="lg"
            onClick={handleGoogleSignIn}
            disabled={loading}
            data-testid="button-google-login"
          >
            {loading ? (
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
