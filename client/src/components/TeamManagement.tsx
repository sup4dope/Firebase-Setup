import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Plus, Edit, Trash2, Users, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import type { Team, User, UserRole } from '@shared/types';

const teamSchema = z.object({
  name: z.string().min(1, '팀 이름을 입력해주세요'),
});

type TeamFormData = z.infer<typeof teamSchema>;

interface TeamManagementProps {
  teams: Team[];
  users: User[];
  currentUserRole: UserRole;
  onCreateTeam: (data: TeamFormData) => Promise<void>;
  onUpdateTeam: (id: string, data: TeamFormData) => Promise<void>;
  onDeleteTeam: (id: string) => Promise<void>;
  onUpdateUserRole: (userId: string, role: UserRole) => Promise<void>;
  onUpdateUserTeam: (userId: string, teamId: string, teamName: string) => Promise<void>;
  isLoading?: boolean;
}

const ROLE_LABELS: Record<UserRole, string> = {
  staff: '팀원',
  team_leader: '팀장',
  super_admin: '총관리자',
};

const ROLE_COLORS: Record<UserRole, string> = {
  staff: 'bg-muted text-muted-foreground',
  team_leader: 'bg-blue-500/10 text-blue-700 dark:text-blue-400',
  super_admin: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
};

export function TeamManagement({
  teams,
  users,
  currentUserRole,
  onCreateTeam,
  onUpdateTeam,
  onDeleteTeam,
  onUpdateUserRole,
  onUpdateUserTeam,
  isLoading,
}: TeamManagementProps) {
  const [teamDialogOpen, setTeamDialogOpen] = useState(false);
  const [editingTeam, setEditingTeam] = useState<Team | null>(null);

  const isSuperAdmin = currentUserRole === 'super_admin';

  const form = useForm<TeamFormData>({
    resolver: zodResolver(teamSchema),
    defaultValues: {
      name: '',
    },
  });

  const handleOpenTeamDialog = (team?: Team) => {
    if (team) {
      setEditingTeam(team);
      form.setValue('name', team.name);
    } else {
      setEditingTeam(null);
      form.reset();
    }
    setTeamDialogOpen(true);
  };

  const handleSubmitTeam = async (data: TeamFormData) => {
    if (editingTeam) {
      await onUpdateTeam(editingTeam.id, data);
    } else {
      await onCreateTeam(data);
    }
    setTeamDialogOpen(false);
    form.reset();
  };

  const getUserCountByTeam = (teamId: string) => {
    return users.filter(u => u.team_id === teamId).length;
  };

  return (
    <div className="space-y-6">
      {/* Teams Section */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
          <CardTitle className="text-lg">팀 관리</CardTitle>
          {isSuperAdmin && (
            <Button 
              size="sm" 
              onClick={() => handleOpenTeamDialog()}
              data-testid="button-add-team"
            >
              <Plus className="w-4 h-4 mr-2" />
              팀 추가
            </Button>
          )}
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>팀명</TableHead>
                <TableHead>인원</TableHead>
                <TableHead>생성일</TableHead>
                {isSuperAdmin && <TableHead className="w-[100px]"></TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {teams.map(team => (
                <TableRow key={team.id} data-testid={`row-team-${team.id}`}>
                  <TableCell className="font-medium">{team.name}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4 text-muted-foreground" />
                      {getUserCountByTeam(team.id)}명
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {format(team.created_at, 'yyyy-MM-dd')}
                  </TableCell>
                  {isSuperAdmin && (
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleOpenTeamDialog(team)}
                          data-testid={`button-edit-team-${team.id}`}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onDeleteTeam(team.id)}
                          disabled={getUserCountByTeam(team.id) > 0}
                          data-testid={`button-delete-team-${team.id}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
              {teams.length === 0 && (
                <TableRow>
                  <TableCell colSpan={isSuperAdmin ? 4 : 3} className="text-center py-8 text-muted-foreground">
                    등록된 팀이 없습니다
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Users Section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">사용자 관리</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>이름</TableHead>
                <TableHead>이메일</TableHead>
                <TableHead>권한</TableHead>
                <TableHead>소속 팀</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map(user => (
                <TableRow key={user.uid} data-testid={`row-user-${user.uid}`}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="w-8 h-8">
                        <AvatarFallback className="text-xs">
                          {user.name.slice(0, 2)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="font-medium">{user.name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{user.email}</TableCell>
                  <TableCell>
                    {isSuperAdmin ? (
                      <Select
                        defaultValue={user.role}
                        onValueChange={(value) => onUpdateUserRole(user.uid, value as UserRole)}
                      >
                        <SelectTrigger className="w-[120px]" data-testid={`select-role-${user.uid}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="staff">팀원</SelectItem>
                          <SelectItem value="team_leader">팀장</SelectItem>
                          <SelectItem value="super_admin">총관리자</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <Badge variant="secondary" className={ROLE_COLORS[user.role]}>
                        {ROLE_LABELS[user.role]}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {isSuperAdmin ? (
                      <Select
                        defaultValue={user.team_id || 'none'}
                        onValueChange={(value) => {
                          const teamId = value === 'none' ? '' : value;
                          const team = teams.find(t => t.id === teamId);
                          onUpdateUserTeam(user.uid, teamId, team?.name || '');
                        }}
                      >
                        <SelectTrigger className="w-[140px]" data-testid={`select-team-${user.uid}`}>
                          <SelectValue placeholder="팀 선택" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">미배정</SelectItem>
                          {teams
                            .filter(team => team.id && team.id.trim() !== '')
                            .map(team => (
                              <SelectItem key={team.id} value={team.id}>
                                {team.name}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <span className="text-muted-foreground">
                        {user.team_name || '미배정'}
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Team Dialog */}
      <Dialog open={teamDialogOpen} onOpenChange={setTeamDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingTeam ? '팀 수정' : '새 팀 추가'}</DialogTitle>
          </DialogHeader>
          
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSubmitTeam)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>팀 이름 *</FormLabel>
                    <FormControl>
                      <Input placeholder="영업1팀" {...field} data-testid="input-team-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => setTeamDialogOpen(false)}
                >
                  취소
                </Button>
                <Button type="submit" disabled={isLoading} data-testid="button-submit-team">
                  {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  {editingTeam ? '수정' : '추가'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
