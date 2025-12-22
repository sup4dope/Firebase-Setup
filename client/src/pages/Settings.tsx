import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { ThemeToggle } from '@/components/ThemeToggle';
import { User, Mail, Building, Shield, LogOut, Phone, Globe, History } from 'lucide-react';
import type { UserRole, LoginHistory } from '@shared/types';
import { Timestamp } from 'firebase/firestore';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';

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

            <div className="flex items-center gap-3">
              <Phone className="w-5 h-5 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">등록된 연락처</p>
                <p className="font-medium">{user.phone || '미등록'}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Globe className="w-5 h-5 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">현재 접속 IP</p>
                <p className="font-medium font-mono text-sm">{user.current_ip || '-'}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Login History Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <History className="w-5 h-5" />
            로그인 이력
          </CardTitle>
          <CardDescription>최근 5회 접속 기록</CardDescription>
        </CardHeader>
        <CardContent>
          {user.login_history && user.login_history.length > 0 ? (
            <div className="space-y-3">
              {user.login_history.slice(0, 5).map((entry, index) => {
                const loggedAt = entry.logged_at instanceof Timestamp 
                  ? (entry.logged_at as Timestamp).toDate() 
                  : new Date(entry.logged_at as unknown as string);
                return (
                  <div 
                    key={index} 
                    className="flex items-center justify-between py-2 border-b border-border last:border-0"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-medium">
                        {index + 1}
                      </div>
                      <div>
                        <p className="text-sm font-medium">
                          {format(loggedAt, 'yyyy-MM-dd (EEE) HH:mm:ss', { locale: ko })}
                        </p>
                        <p className="text-xs text-muted-foreground font-mono">{entry.ip}</p>
                      </div>
                    </div>
                    {index === 0 && (
                      <Badge variant="secondary" className="text-xs">현재</Badge>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">
              로그인 이력이 없습니다
            </p>
          )}
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
