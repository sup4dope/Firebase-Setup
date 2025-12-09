import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { ThemeToggle } from '@/components/ThemeToggle';
import { User, Mail, Building, Shield, LogOut } from 'lucide-react';
import type { UserRole } from '@shared/types';

const ROLE_LABELS: Record<UserRole, string> = {
  staff: '팀원',
  team_leader: '팀장',
  super_admin: '총관리자',
};

const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  staff: '본인 담당 고객 조회/수정, 개인 TO-DO 관리',
  team_leader: '팀 전체 데이터 조회, 팀원 TO-DO 할당',
  super_admin: '모든 데이터 관리, 팀/공휴일 설정',
};

export default function Settings() {
  const { user, signOut } = useAuth();

  if (!user) return null;

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">설정</h1>

      {/* Profile Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">내 프로필</CardTitle>
          <CardDescription>계정 정보를 확인합니다</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center gap-4">
            <Avatar className="w-16 h-16">
              <AvatarFallback className="text-xl">{user.name.slice(0, 2)}</AvatarFallback>
            </Avatar>
            <div className="space-y-1">
              <h3 className="text-lg font-semibold">{user.name}</h3>
              <Badge variant="secondary">{ROLE_LABELS[user.role]}</Badge>
            </div>
          </div>

          <Separator />

          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Mail className="w-5 h-5 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">이메일</p>
                <p className="font-medium">{user.email}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Building className="w-5 h-5 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">소속 팀</p>
                <p className="font-medium">{user.team_name || '미배정'}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Shield className="w-5 h-5 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">권한</p>
                <p className="font-medium">{ROLE_LABELS[user.role]}</p>
                <p className="text-xs text-muted-foreground">{ROLE_DESCRIPTIONS[user.role]}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Appearance Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">화면 설정</CardTitle>
          <CardDescription>앱의 외관을 설정합니다</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">다크 모드</p>
              <p className="text-sm text-muted-foreground">어두운 테마를 사용합니다</p>
            </div>
            <ThemeToggle />
          </div>
        </CardContent>
      </Card>

      {/* Sign Out */}
      <Card>
        <CardContent className="pt-6">
          <Button 
            variant="destructive" 
            className="w-full" 
            onClick={signOut}
            data-testid="button-settings-signout"
          >
            <LogOut className="w-4 h-4 mr-2" />
            로그아웃
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
