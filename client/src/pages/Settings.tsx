import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { ThemeToggle } from '@/components/ThemeToggle';
import { User, Mail, Building, Shield, LogOut, Phone, Globe, History, Calendar, CreditCard, Pencil, Check, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { updateUserInfo } from '@/lib/firestore';
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
  const { user, userDocId, signOut, refreshUser } = useAuth();
  const { toast } = useToast();
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const handleStartEdit = (field: string, currentValue: string) => {
    setEditingField(field);
    setEditValue(currentValue || '');
  };

  const handleCancelEdit = () => {
    setEditingField(null);
    setEditValue('');
  };

  const handleSaveEdit = async (field: string) => {
    if (!user || !userDocId) return;
    try {
      await updateUserInfo(userDocId, { [field]: editValue });
      if (refreshUser) await refreshUser();
      toast({
        title: '저장 완료',
        description: '연락처가 수정되었습니다.',
      });
      setEditingField(null);
      setEditValue('');
    } catch (error) {
      console.error('Error updating user:', error);
      toast({
        title: '오류',
        description: '저장 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    }
  };

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
              <Calendar className="w-5 h-5 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">입사일자</p>
                <p className="font-medium">
                  {user.hire_date 
                    ? format(new Date(user.hire_date), 'yyyy년 M월 d일', { locale: ko })
                    : '미등록'}
                </p>
              </div>
            </div>

            <Separator />

            <div className="flex items-center gap-3">
              <Phone className="w-5 h-5 text-muted-foreground" />
              <div className="flex-1">
                <p className="text-sm text-muted-foreground">연락처 (업무용)</p>
                {editingField === 'phone_work' ? (
                  <div className="flex items-center gap-2 mt-1">
                    <Input 
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      placeholder="010-0000-0000"
                      className="h-8"
                      data-testid="input-phone-work"
                    />
                    <Button 
                      size="icon" 
                      variant="ghost" 
                      className="h-8 w-8" 
                      onClick={() => handleSaveEdit('phone_work')}
                      data-testid="button-save-phone-work"
                    >
                      <Check className="h-4 w-4 text-green-500" />
                    </Button>
                    <Button 
                      size="icon" 
                      variant="ghost" 
                      className="h-8 w-8" 
                      onClick={handleCancelEdit}
                      data-testid="button-cancel-phone-work"
                    >
                      <X className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                ) : (
                  <p className="font-medium">{user.phone_work || user.phone || '미등록'}</p>
                )}
              </div>
              {editingField !== 'phone_work' && (
                <Button 
                  size="icon" 
                  variant="ghost" 
                  onClick={() => handleStartEdit('phone_work', user.phone_work || user.phone || '')}
                  data-testid="button-edit-phone-work"
                >
                  <Pencil className="h-4 w-4 text-muted-foreground" />
                </Button>
              )}
            </div>

            <div className="flex items-center gap-3">
              <Phone className="w-5 h-5 text-muted-foreground" />
              <div className="flex-1">
                <p className="text-sm text-muted-foreground">연락처 (개인용)</p>
                {editingField === 'phone_personal' ? (
                  <div className="flex items-center gap-2 mt-1">
                    <Input 
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      placeholder="010-0000-0000"
                      className="h-8"
                      data-testid="input-phone-personal"
                    />
                    <Button 
                      size="icon" 
                      variant="ghost" 
                      className="h-8 w-8" 
                      onClick={() => handleSaveEdit('phone_personal')}
                      data-testid="button-save-phone-personal"
                    >
                      <Check className="h-4 w-4 text-green-500" />
                    </Button>
                    <Button 
                      size="icon" 
                      variant="ghost" 
                      className="h-8 w-8" 
                      onClick={handleCancelEdit}
                      data-testid="button-cancel-phone-personal"
                    >
                      <X className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                ) : (
                  <p className="font-medium">{user.phone_personal || '미등록'}</p>
                )}
              </div>
              {editingField !== 'phone_personal' && (
                <Button 
                  size="icon" 
                  variant="ghost" 
                  onClick={() => handleStartEdit('phone_personal', user.phone_personal || '')}
                  data-testid="button-edit-phone-personal"
                >
                  <Pencil className="h-4 w-4 text-muted-foreground" />
                </Button>
              )}
            </div>

            <Separator />

            <div className="flex items-center gap-3">
              <CreditCard className="w-5 h-5 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">급여계좌 정보</p>
                {user.bank_name && user.bank_account ? (
                  <p className="font-medium">{user.bank_name} {user.bank_account}</p>
                ) : (
                  <p className="font-medium text-muted-foreground">미등록</p>
                )}
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
