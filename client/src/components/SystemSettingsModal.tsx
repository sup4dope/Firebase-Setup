import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Users, Building2, Plus, Trash2, Pencil, UserPlus, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  getAllUsers,
  getTeams,
  createUser,
  updateUserInfo,
  deleteUser,
  getUserDocIdByEmail,
  createTeamAdmin,
  deleteTeamAdmin,
  updateTeamAdmin,
} from '@/lib/firestore';
import type { User, Team, UserRole, UserStatus } from '@shared/types';

interface SystemSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const ROLE_LABELS: Record<UserRole, string> = {
  staff: '팀원',
  team_leader: '팀장',
  super_admin: '총관리자',
};

const STATUS_LABELS: Record<UserStatus, string> = {
  '재직': '재직',
  '퇴사': '퇴사',
};

export function SystemSettingsModal({ isOpen, onClose }: SystemSettingsModalProps) {
  const [activeTab, setActiveTab] = useState('employees');
  const [users, setUsers] = useState<(User & { docId?: string })[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);

  const [showAddEmployee, setShowAddEmployee] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteTargetUser, setDeleteTargetUser] = useState<(User & { docId?: string }) | null>(null);
  const [deleteTargetTeam, setDeleteTargetTeam] = useState<Team | null>(null);
  const [showDeleteTeamConfirm, setShowDeleteTeamConfirm] = useState(false);

  const [newTeamName, setNewTeamName] = useState('');

  const [newEmployee, setNewEmployee] = useState({
    name: '',
    email: '',
    phone: '',
    role: 'staff' as UserRole,
    team_id: '' as string,
  });

  const loadData = async () => {
    setLoading(true);
    try {
      const [usersData, teamsData] = await Promise.all([
        getAllUsers(),
        getTeams(),
      ]);

      const usersWithDocId = await Promise.all(
        usersData.map(async (user) => {
          const docId = await getUserDocIdByEmail(user.email);
          return { ...user, docId: docId || user.uid };
        })
      );

      setUsers(usersWithDocId);
      setTeams(teamsData);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen]);

  const handleAddEmployee = async () => {
    if (!newEmployee.name || !newEmployee.email) {
      alert('이름과 이메일은 필수입니다.');
      return;
    }

    const existingUser = users.find((u) => u.email === newEmployee.email);
    if (existingUser) {
      alert('이미 등록된 이메일입니다.');
      return;
    }

    try {
      const team = teams.find((t) => t.id === newEmployee.team_id);
      await createUser({
        name: newEmployee.name,
        email: newEmployee.email,
        phone: newEmployee.phone || undefined,
        role: newEmployee.role,
        team_id: newEmployee.team_id || null,
        team_name: team?.team_name || team?.name || null,
      });

      setNewEmployee({
        name: '',
        email: '',
        phone: '',
        role: 'staff',
        team_id: '',
      });
      setShowAddEmployee(false);
      await loadData();
    } catch (error) {
      console.error('Error adding employee:', error);
      alert('직원 등록 중 오류가 발생했습니다.');
    }
  };

  const handleRoleChange = async (user: User & { docId?: string }, newRole: UserRole) => {
    if (!user.docId) return;
    try {
      await updateUserInfo(user.docId, { role: newRole });
      await loadData();
    } catch (error) {
      console.error('Error updating role:', error);
      alert('직급 변경 중 오류가 발생했습니다.');
    }
  };

  const handleStatusChange = async (user: User & { docId?: string }, newStatus: UserStatus) => {
    if (!user.docId) return;
    try {
      await updateUserInfo(user.docId, { status: newStatus });
      await loadData();
    } catch (error) {
      console.error('Error updating status:', error);
      alert('상태 변경 중 오류가 발생했습니다.');
    }
  };

  const handleDeleteUser = async () => {
    if (!deleteTargetUser?.docId) return;
    try {
      await deleteUser(deleteTargetUser.docId);
      setShowDeleteConfirm(false);
      setDeleteTargetUser(null);
      await loadData();
    } catch (error) {
      console.error('Error deleting user:', error);
      alert('직원 삭제 중 오류가 발생했습니다.');
    }
  };

  const handleAddTeam = async () => {
    if (!newTeamName.trim()) {
      alert('팀명을 입력하세요.');
      return;
    }

    const existingTeam = teams.find(
      (t) => t.team_name === newTeamName || t.name === newTeamName
    );
    if (existingTeam) {
      alert('이미 존재하는 팀명입니다.');
      return;
    }

    try {
      await createTeamAdmin(newTeamName.trim());
      setNewTeamName('');
      await loadData();
    } catch (error) {
      console.error('Error creating team:', error);
      alert('팀 생성 중 오류가 발생했습니다.');
    }
  };

  const handleDeleteTeam = async () => {
    if (!deleteTargetTeam) return;
    try {
      await deleteTeamAdmin(deleteTargetTeam.id);
      setShowDeleteTeamConfirm(false);
      setDeleteTargetTeam(null);
      await loadData();
    } catch (error) {
      console.error('Error deleting team:', error);
      alert('팀 삭제 중 오류가 발생했습니다.');
    }
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-4xl h-[80vh] bg-gray-900 border-gray-700 text-gray-100 flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-gray-100 flex items-center gap-2">
              <Building2 className="w-5 h-5 text-blue-400" />
              시스템 설정
            </DialogTitle>
          </DialogHeader>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
            <TabsList className="grid w-full grid-cols-2 bg-gray-800">
              <TabsTrigger
                value="employees"
                className="data-[state=active]:bg-blue-600 data-[state=active]:text-white"
                data-testid="tab-employees"
              >
                <Users className="w-4 h-4 mr-2" />
                직원(인사) 관리
              </TabsTrigger>
              <TabsTrigger
                value="teams"
                className="data-[state=active]:bg-blue-600 data-[state=active]:text-white"
                data-testid="tab-teams"
              >
                <Building2 className="w-4 h-4 mr-2" />
                팀 관리
              </TabsTrigger>
            </TabsList>

            <TabsContent value="employees" className="flex-1 overflow-hidden flex flex-col mt-4">
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm text-gray-400">
                  등록된 직원: {users.length}명
                </p>
                <Button
                  size="sm"
                  onClick={() => setShowAddEmployee(true)}
                  className="bg-blue-600 hover:bg-blue-700"
                  data-testid="button-add-employee"
                >
                  <UserPlus className="w-4 h-4 mr-2" />
                  직원 등록
                </Button>
              </div>

              <ScrollArea className="flex-1">
                {loading ? (
                  <div className="text-center py-8 text-gray-500">로딩 중...</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow className="border-gray-700">
                        <TableHead className="text-gray-400">이름</TableHead>
                        <TableHead className="text-gray-400">이메일</TableHead>
                        <TableHead className="text-gray-400">연락처</TableHead>
                        <TableHead className="text-gray-400">소속팀</TableHead>
                        <TableHead className="text-gray-400">직급</TableHead>
                        <TableHead className="text-gray-400">상태</TableHead>
                        <TableHead className="text-gray-400 text-right">관리</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {users.map((user) => (
                        <TableRow key={user.docId || user.uid} className="border-gray-700">
                          <TableCell className="text-gray-200 font-medium">
                            {user.name}
                          </TableCell>
                          <TableCell className="text-gray-300 text-sm">
                            {user.email}
                          </TableCell>
                          <TableCell className="text-gray-300 text-sm">
                            {user.phone || '-'}
                          </TableCell>
                          <TableCell className="text-gray-300 text-sm">
                            {user.team_name || '-'}
                          </TableCell>
                          <TableCell>
                            <Select
                              value={user.role}
                              onValueChange={(v) => handleRoleChange(user, v as UserRole)}
                            >
                              <SelectTrigger className="w-24 h-7 text-xs bg-gray-800 border-gray-600">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent className="bg-gray-800 border-gray-700">
                                <SelectItem value="staff" className="text-gray-200">팀원</SelectItem>
                                <SelectItem value="team_leader" className="text-gray-200">팀장</SelectItem>
                                <SelectItem value="super_admin" className="text-gray-200">총관리자</SelectItem>
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell>
                            <Select
                              value={user.status || '재직'}
                              onValueChange={(v) => handleStatusChange(user, v as UserStatus)}
                            >
                              <SelectTrigger className={cn(
                                "w-20 h-7 text-xs border-gray-600",
                                user.status === '퇴사' ? "bg-red-900/30 text-red-400" : "bg-green-900/30 text-green-400"
                              )}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent className="bg-gray-800 border-gray-700">
                                <SelectItem value="재직" className="text-green-400">재직</SelectItem>
                                <SelectItem value="퇴사" className="text-red-400">퇴사</SelectItem>
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                setDeleteTargetUser(user);
                                setShowDeleteConfirm(true);
                              }}
                              className="text-red-400 hover:text-red-300 hover:bg-red-900/20"
                              data-testid={`button-delete-user-${user.email}`}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </ScrollArea>
            </TabsContent>

            <TabsContent value="teams" className="flex-1 overflow-hidden flex flex-col mt-4">
              <div className="flex items-center gap-2 mb-4">
                <Input
                  value={newTeamName}
                  onChange={(e) => setNewTeamName(e.target.value)}
                  placeholder="새 팀명 입력"
                  className="flex-1 bg-gray-800 border-gray-600 text-gray-200"
                  data-testid="input-new-team-name"
                />
                <Button
                  size="sm"
                  onClick={handleAddTeam}
                  className="bg-blue-600 hover:bg-blue-700"
                  data-testid="button-add-team"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  팀 추가
                </Button>
              </div>

              <ScrollArea className="flex-1">
                {loading ? (
                  <div className="text-center py-8 text-gray-500">로딩 중...</div>
                ) : teams.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    등록된 팀이 없습니다.
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow className="border-gray-700">
                        <TableHead className="text-gray-400">팀명</TableHead>
                        <TableHead className="text-gray-400">소속 직원 수</TableHead>
                        <TableHead className="text-gray-400 text-right">관리</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {teams.map((team) => {
                        const memberCount = users.filter((u) => u.team_id === team.id).length;
                        return (
                          <TableRow key={team.id} className="border-gray-700">
                            <TableCell className="text-gray-200 font-medium">
                              {team.team_name || team.name}
                            </TableCell>
                            <TableCell className="text-gray-300">
                              <Badge variant="secondary" className="bg-gray-700 text-gray-300">
                                {memberCount}명
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => {
                                  setDeleteTargetTeam(team);
                                  setShowDeleteTeamConfirm(true);
                                }}
                                className="text-red-400 hover:text-red-300 hover:bg-red-900/20"
                                data-testid={`button-delete-team-${team.id}`}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      {showAddEmployee && (
        <Dialog open={showAddEmployee} onOpenChange={setShowAddEmployee}>
          <DialogContent className="max-w-md bg-gray-900 border-gray-700 text-gray-100">
            <DialogHeader>
              <DialogTitle className="text-lg font-bold text-gray-100 flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-blue-400" />
                직원 등록
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div>
                <Label className="text-gray-400 text-sm">성명 *</Label>
                <Input
                  value={newEmployee.name}
                  onChange={(e) => setNewEmployee({ ...newEmployee, name: e.target.value })}
                  placeholder="홍길동"
                  className="bg-gray-800 border-gray-600 text-gray-200 mt-1"
                  data-testid="input-employee-name"
                />
              </div>

              <div>
                <Label className="text-gray-400 text-sm">구글 이메일 *</Label>
                <Input
                  type="email"
                  value={newEmployee.email}
                  onChange={(e) => setNewEmployee({ ...newEmployee, email: e.target.value })}
                  placeholder="example@gmail.com"
                  className="bg-gray-800 border-gray-600 text-gray-200 mt-1"
                  data-testid="input-employee-email"
                />
              </div>

              <div>
                <Label className="text-gray-400 text-sm">연락처</Label>
                <Input
                  value={newEmployee.phone}
                  onChange={(e) => setNewEmployee({ ...newEmployee, phone: e.target.value })}
                  placeholder="010-0000-0000"
                  className="bg-gray-800 border-gray-600 text-gray-200 mt-1"
                  data-testid="input-employee-phone"
                />
              </div>

              <div>
                <Label className="text-gray-400 text-sm">직급</Label>
                <Select
                  value={newEmployee.role}
                  onValueChange={(v) => setNewEmployee({ ...newEmployee, role: v as UserRole })}
                >
                  <SelectTrigger className="bg-gray-800 border-gray-600 text-gray-200 mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-gray-800 border-gray-700">
                    <SelectItem value="staff" className="text-gray-200">팀원</SelectItem>
                    <SelectItem value="team_leader" className="text-gray-200">팀장</SelectItem>
                    <SelectItem value="super_admin" className="text-gray-200">총관리자</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-gray-400 text-sm">소속 팀</Label>
                <Select
                  value={newEmployee.team_id}
                  onValueChange={(v) => setNewEmployee({ ...newEmployee, team_id: v })}
                >
                  <SelectTrigger className="bg-gray-800 border-gray-600 text-gray-200 mt-1">
                    <SelectValue placeholder="팀 선택 (선택사항)" />
                  </SelectTrigger>
                  <SelectContent className="bg-gray-800 border-gray-700">
                    <SelectItem value="" className="text-gray-400">없음</SelectItem>
                    {teams.map((team) => (
                      <SelectItem key={team.id} value={team.id} className="text-gray-200">
                        {team.team_name || team.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setShowAddEmployee(false)}
                className="border-gray-600 text-gray-300"
              >
                취소
              </Button>
              <Button
                onClick={handleAddEmployee}
                className="bg-blue-600 hover:bg-blue-700"
                data-testid="button-confirm-add-employee"
              >
                등록
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent className="bg-gray-900 border-gray-700 text-gray-100">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-gray-100">직원 삭제 확인</AlertDialogTitle>
            <AlertDialogDescription className="text-gray-400">
              <span className="font-semibold text-red-400">{deleteTargetUser?.name}</span> ({deleteTargetUser?.email}) 님을 화이트리스트에서 삭제하시겠습니까?
              <br />
              <span className="text-red-400">삭제 시 해당 사용자는 더 이상 시스템에 접속할 수 없습니다.</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-gray-800 border-gray-600 text-gray-300 hover:bg-gray-700">
              취소
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteUser}
              className="bg-red-600 hover:bg-red-700"
            >
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showDeleteTeamConfirm} onOpenChange={setShowDeleteTeamConfirm}>
        <AlertDialogContent className="bg-gray-900 border-gray-700 text-gray-100">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-gray-100">팀 삭제 확인</AlertDialogTitle>
            <AlertDialogDescription className="text-gray-400">
              <span className="font-semibold text-red-400">{deleteTargetTeam?.team_name || deleteTargetTeam?.name}</span> 팀을 삭제하시겠습니까?
              <br />
              <span className="text-yellow-400">해당 팀 소속 직원들의 팀 정보가 '없음'으로 변경됩니다.</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-gray-800 border-gray-600 text-gray-300 hover:bg-gray-700">
              취소
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteTeam}
              className="bg-red-600 hover:bg-red-700"
            >
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
