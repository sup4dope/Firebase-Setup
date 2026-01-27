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
import { Users, Building2, Plus, Trash2, Pencil, UserPlus, X, Search, Settings2 } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
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
  const [showEditEmployee, setShowEditEmployee] = useState(false);
  const [editTargetUser, setEditTargetUser] = useState<(User & { docId?: string }) | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteTargetUser, setDeleteTargetUser] = useState<(User & { docId?: string }) | null>(null);
  const [deleteTargetTeam, setDeleteTargetTeam] = useState<Team | null>(null);
  const [showDeleteTeamConfirm, setShowDeleteTeamConfirm] = useState(false);
  const [showDistributionSettings, setShowDistributionSettings] = useState(false);
  const [distributionSettings, setDistributionSettings] = useState<{
    [userId: string]: { enabled: boolean; limit: number };
  }>({});
  const [savingDistribution, setSavingDistribution] = useState(false);

  const [newTeamName, setNewTeamName] = useState('');

  const [newEmployee, setNewEmployee] = useState({
    name: '',
    email: '',
    phone_work: '',
    phone_personal: '',
    ssn_front: '',
    ssn_back: '',
    address: '',
    bank_name: '',
    bank_account: '',
    hire_date: new Date().toISOString().split('T')[0],
    role: 'staff' as UserRole,
    team_id: '' as string,
    totalLeave: 15,
    commissionRates: {
      teamOverride: 0,
      ad: 0,
      referral: 0,
      reExecution: 0,
      outsource: 0,
    },
  });

  const [employeeSearch, setEmployeeSearch] = useState('');
  
  const [editEmployee, setEditEmployee] = useState({
    name: '',
    email: '',
    phone_work: '',
    phone_personal: '',
    ssn_front: '',
    ssn_back: '',
    address: '',
    bank_name: '',
    bank_account: '',
    hire_date: '',
    role: 'staff' as UserRole,
    team_id: '' as string,
    totalLeave: 15,
    commissionRates: {
      teamOverride: 0,
      ad: 0,
      referral: 0,
      reExecution: 0,
      outsource: 0,
      adDeposit: 0,
      referralDeposit: 0,
    },
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
        phone: newEmployee.phone_work || undefined,
        phone_work: newEmployee.phone_work || undefined,
        phone_personal: newEmployee.phone_personal || undefined,
        ssn_front: newEmployee.ssn_front || undefined,
        ssn_back: newEmployee.ssn_back || undefined,
        address: newEmployee.address || undefined,
        bank_name: newEmployee.bank_name || undefined,
        bank_account: newEmployee.bank_account || undefined,
        hire_date: newEmployee.hire_date || undefined,
        role: newEmployee.role,
        team_id: newEmployee.team_id || null,
        team_name: team?.team_name || team?.name || null,
        totalLeave: newEmployee.totalLeave,
        usedLeave: 0,
        commissionRates: newEmployee.commissionRates,
      });

      setNewEmployee({
        name: '',
        email: '',
        phone_work: '',
        phone_personal: '',
        ssn_front: '',
        ssn_back: '',
        address: '',
        bank_name: '',
        bank_account: '',
        hire_date: new Date().toISOString().split('T')[0],
        role: 'staff',
        team_id: '',
        totalLeave: 15,
        commissionRates: {
          teamOverride: 0,
          ad: 0,
          referral: 0,
          reExecution: 0,
          outsource: 0,
        },
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

  const handleTeamChange = async (user: User & { docId?: string }, newTeamId: string) => {
    if (!user.docId) return;
    try {
      const team = teams.find((t) => t.id === newTeamId);
      await updateUserInfo(user.docId, { 
        team_id: newTeamId === 'none' ? null : newTeamId,
        team_name: newTeamId === 'none' ? null : (team?.team_name || team?.name || null),
      });
      await loadData();
    } catch (error) {
      console.error('Error updating team:', error);
      alert('소속팀 변경 중 오류가 발생했습니다.');
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

  const handleOpenEditEmployee = (user: User & { docId?: string }) => {
    setEditTargetUser(user);
    const userCommissionRates = (user as any).commissionRates || {};
    setEditEmployee({
      name: user.name || '',
      email: user.email || '',
      phone_work: user.phone_work || user.phone || '',
      phone_personal: user.phone_personal || '',
      ssn_front: user.ssn_front || '',
      ssn_back: user.ssn_back || '',
      address: user.address || '',
      bank_name: user.bank_name || '',
      bank_account: user.bank_account || '',
      hire_date: user.hire_date || '',
      role: user.role,
      team_id: user.team_id || '',
      totalLeave: user.totalLeave ?? 15,
      commissionRates: {
        teamOverride: userCommissionRates.teamOverride || 0,
        ad: userCommissionRates.ad || 0,
        referral: userCommissionRates.referral || 0,
        reExecution: userCommissionRates.reExecution || 0,
        outsource: userCommissionRates.outsource || 0,
        adDeposit: userCommissionRates.adDeposit || 0,
        referralDeposit: userCommissionRates.referralDeposit || 0,
      },
    });
    setShowEditEmployee(true);
  };

  const handleUpdateEmployee = async () => {
    if (!editTargetUser?.docId) return;
    
    try {
      const team = teams.find((t) => t.id === editEmployee.team_id);
      await updateUserInfo(editTargetUser.docId, {
        name: editEmployee.name,
        phone: editEmployee.phone_work || undefined,
        phone_work: editEmployee.phone_work || undefined,
        phone_personal: editEmployee.phone_personal || undefined,
        ssn_front: editEmployee.ssn_front || undefined,
        ssn_back: editEmployee.ssn_back || undefined,
        address: editEmployee.address || undefined,
        bank_name: editEmployee.bank_name || undefined,
        bank_account: editEmployee.bank_account || undefined,
        hire_date: editEmployee.hire_date || undefined,
        role: editEmployee.role,
        team_id: editEmployee.team_id || null,
        team_name: team?.team_name || team?.name || null,
        totalLeave: editEmployee.totalLeave,
        commissionRates: editEmployee.commissionRates,
      });

      setShowEditEmployee(false);
      setEditTargetUser(null);
      await loadData();
    } catch (error) {
      console.error('Error updating employee:', error);
      alert('직원 정보 수정 중 오류가 발생했습니다.');
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

  const handleOpenDistributionSettings = () => {
    const settings: { [userId: string]: { enabled: boolean; limit: number } } = {};
    users.forEach((user) => {
      settings[user.docId || user.uid] = {
        enabled: user.db_distribution_enabled !== false,
        limit: user.daily_db_limit || 0,
      };
    });
    setDistributionSettings(settings);
    setShowDistributionSettings(true);
  };

  const handleSaveDistributionSettings = async () => {
    setSavingDistribution(true);
    try {
      for (const user of users) {
        const userId = user.docId || user.uid;
        const settings = distributionSettings[userId];
        if (settings) {
          await updateUserInfo(userId, {
            db_distribution_enabled: settings.enabled,
            daily_db_limit: settings.limit,
          });
        }
      }
      await loadData();
      setShowDistributionSettings(false);
      alert('분배 설정이 저장되었습니다.');
    } catch (error) {
      console.error('Error saving distribution settings:', error);
      alert('분배 설정 저장 중 오류가 발생했습니다.');
    } finally {
      setSavingDistribution(false);
    }
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-5xl h-[85vh] bg-background border-border text-foreground flex flex-col overflow-hidden">
          <DialogHeader className="shrink-0">
            <DialogTitle className="text-xl font-bold text-foreground flex items-center gap-2">
              <Building2 className="w-5 h-5 text-blue-600 dark:text-blue-600 dark:text-blue-400" />
              시스템 설정
            </DialogTitle>
          </DialogHeader>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
            <TabsList className="grid w-full grid-cols-2 bg-muted shrink-0">
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

            <TabsContent value="employees" className="flex-1 flex flex-col mt-4 min-h-0" style={{ display: activeTab === 'employees' ? 'flex' : 'none' }}>
              <div className="flex items-center justify-between mb-4 shrink-0 gap-4">
                <div className="flex items-center gap-4">
                  <p className="text-sm text-muted-foreground whitespace-nowrap">
                    등록된 직원: {users.length}명
                  </p>
                  <div className="relative">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      value={employeeSearch}
                      onChange={(e) => setEmployeeSearch(e.target.value)}
                      placeholder="이름, 이메일 검색..."
                      className="pl-8 w-48 h-8 text-sm bg-muted border-border text-foreground"
                      data-testid="input-employee-search"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleOpenDistributionSettings}
                    className="border-border"
                    data-testid="button-distribution-settings"
                  >
                    <Settings2 className="w-4 h-4 mr-2" />
                    분배 설정
                  </Button>
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
              </div>

              <div className="flex-1 overflow-y-auto min-h-0">
                {loading ? (
                  <div className="text-center py-8 text-muted-foreground">로딩 중...</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow className="border-border h-10">
                        <TableHead className="text-muted-foreground py-2 w-24">이름</TableHead>
                        <TableHead className="text-muted-foreground py-2 whitespace-nowrap">연락처(개인)</TableHead>
                        <TableHead className="text-muted-foreground py-2 whitespace-nowrap">연락처(업무)</TableHead>
                        <TableHead className="text-muted-foreground py-2">소속팀</TableHead>
                        <TableHead className="text-muted-foreground py-2">직급</TableHead>
                        <TableHead className="text-muted-foreground py-2">상태</TableHead>
                        <TableHead className="text-muted-foreground py-2 text-right">관리</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {users
                        .filter((user) => {
                          if (!employeeSearch.trim()) return true;
                          const search = employeeSearch.toLowerCase().replace(/-/g, '');
                          const phonePersonalNormalized = user.phone_personal?.replace(/-/g, '').toLowerCase() || '';
                          const phoneWorkNormalized = user.phone_work?.replace(/-/g, '').toLowerCase() || '';
                          return (
                            user.name?.toLowerCase().includes(search) ||
                            user.email?.toLowerCase().includes(search) ||
                            phonePersonalNormalized.includes(search) ||
                            phoneWorkNormalized.includes(search)
                          );
                        })
                        .sort((a, b) => {
                          const teamA = teams.find(t => t.id === a.team_id);
                          const teamB = teams.find(t => t.id === b.team_id);
                          const teamNameA = teamA?.team_name || teamA?.name || '';
                          const teamNameB = teamB?.team_name || teamB?.name || '';
                          return teamNameA.localeCompare(teamNameB, 'ko');
                        })
                        .map((user) => (
                        <TableRow key={user.docId || user.uid} className="border-border h-12">
                          <TableCell 
                            className="text-foreground font-medium py-2 cursor-pointer hover:text-blue-600 dark:hover:text-blue-400 transition-colors w-24"
                            onDoubleClick={() => handleOpenEditEmployee(user)}
                            title="더블클릭하여 수정"
                          >
                            {user.name}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm py-2 whitespace-nowrap">
                            {user.phone_personal || '-'}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm py-2 whitespace-nowrap">
                            {user.phone_work || '-'}
                          </TableCell>
                          <TableCell className="py-2">
                            <Select
                              value={user.team_id || 'none'}
                              onValueChange={(v) => handleTeamChange(user, v)}
                            >
                              <SelectTrigger className="w-24 h-7 text-xs bg-muted border-border">
                                <SelectValue placeholder="-" />
                              </SelectTrigger>
                              <SelectContent className="bg-popover border-border">
                                <SelectItem value="none" className="text-muted-foreground">-</SelectItem>
                                {teams
                                  .filter((team) => team.id && team.id.trim() !== '')
                                  .map((team) => (
                                    <SelectItem key={team.id} value={team.id} className="text-foreground">
                                      {team.team_name || team.name}
                                    </SelectItem>
                                  ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell className="py-2">
                            <Select
                              value={user.role}
                              onValueChange={(v) => handleRoleChange(user, v as UserRole)}
                            >
                              <SelectTrigger className="w-24 h-7 text-xs bg-muted border-border">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent className="bg-popover border-border">
                                <SelectItem value="staff" className="text-foreground">팀원</SelectItem>
                                <SelectItem value="team_leader" className="text-foreground">팀장</SelectItem>
                                <SelectItem value="super_admin" className="text-foreground">총관리자</SelectItem>
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell className="py-2">
                            <Select
                              value={user.status || '재직'}
                              onValueChange={(v) => handleStatusChange(user, v as UserStatus)}
                            >
                              <SelectTrigger className={cn(
                                "w-20 h-7 text-xs border-border",
                                user.status === '퇴사' ? "bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400" : "bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400"
                              )}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent className="bg-popover border-border">
                                <SelectItem value="재직" className="text-green-600 dark:text-green-400">재직</SelectItem>
                                <SelectItem value="퇴사" className="text-red-600 dark:text-red-400">퇴사</SelectItem>
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell className="text-right py-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                setDeleteTargetUser(user);
                                setShowDeleteConfirm(true);
                              }}
                              className="text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/20"
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
              </div>
            </TabsContent>

            <TabsContent value="teams" className="flex-1 flex flex-col mt-4 min-h-0" style={{ display: activeTab === 'teams' ? 'flex' : 'none' }}>
              <div className="flex items-center gap-2 mb-4 shrink-0">
                <Input
                  value={newTeamName}
                  onChange={(e) => setNewTeamName(e.target.value)}
                  placeholder="새 팀명 입력"
                  className="flex-1 bg-muted border-border text-foreground"
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

              <div className="flex-1 overflow-y-auto min-h-0">
                {loading ? (
                  <div className="text-center py-8 text-muted-foreground">로딩 중...</div>
                ) : teams.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    등록된 팀이 없습니다.
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow className="border-border h-10">
                        <TableHead className="text-muted-foreground">팀명</TableHead>
                        <TableHead className="text-muted-foreground">소속 직원 수</TableHead>
                        <TableHead className="text-muted-foreground text-right">관리</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {teams.map((team) => {
                        const memberCount = users.filter((u) => u.team_id === team.id).length;
                        return (
                          <TableRow key={team.id} className="border-border">
                            <TableCell className="text-foreground font-medium">
                              {team.team_name || team.name}
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              <Badge variant="secondary">
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
                                className="text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/20"
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
              </div>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
      {showAddEmployee && (
        <Dialog open={showAddEmployee} onOpenChange={setShowAddEmployee}>
          <DialogContent className="max-w-lg max-h-[85vh] bg-background border-border text-foreground overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-lg font-bold text-foreground flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-blue-600 dark:text-blue-600 dark:text-blue-400" />
                직원 등록
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label className="text-muted-foreground text-sm">입사일자</Label>
                  <Input
                    type="date"
                    value={newEmployee.hire_date}
                    onChange={(e) => setNewEmployee({ ...newEmployee, hire_date: e.target.value })}
                    className="bg-muted border-border text-foreground mt-1"
                    data-testid="input-employee-hire-date"
                  />
                </div>

                <div>
                  <Label className="text-muted-foreground text-sm">직급</Label>
                  <Select
                    value={newEmployee.role}
                    onValueChange={(v) => setNewEmployee({ ...newEmployee, role: v as UserRole })}
                  >
                    <SelectTrigger className="bg-muted border-border text-foreground mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-popover border-border">
                      <SelectItem value="staff" className="text-foreground">팀원</SelectItem>
                      <SelectItem value="team_leader" className="text-foreground">팀장</SelectItem>
                      <SelectItem value="super_admin" className="text-foreground">총관리자</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-muted-foreground text-sm">소속 팀</Label>
                  {teams.filter(t => t.id && t.id.trim() !== '').length === 0 ? (
                    <div className="mt-1 p-2 bg-muted border border-border rounded-md text-muted-foreground text-sm">
                      팀 없음
                    </div>
                  ) : (
                    <Select
                      value={newEmployee.team_id || 'none'}
                      onValueChange={(v) => setNewEmployee({ ...newEmployee, team_id: v === 'none' ? '' : v })}
                    >
                      <SelectTrigger className="bg-muted border-border text-foreground mt-1">
                        <SelectValue placeholder="선택" />
                      </SelectTrigger>
                      <SelectContent className="bg-popover border-border">
                        <SelectItem value="none" className="text-muted-foreground">없음</SelectItem>
                        {teams
                          .filter((team) => team.id && team.id.trim() !== '' && team.team_id && team.team_id.trim() !== '')
                          .map((team) => (
                            <SelectItem key={team.id} value={team.id} className="text-foreground">
                              {team.team_name || team.name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </div>

              <div>
                <Label className="text-muted-foreground text-sm">연간 연차 개수</Label>
                <div className="relative mt-1">
                  <Input
                    type="number"
                    min="0"
                    max="30"
                    step="0.5"
                    value={newEmployee.totalLeave}
                    onChange={(e) => setNewEmployee({ ...newEmployee, totalLeave: parseFloat(e.target.value) || 0 })}
                    placeholder="15"
                    className="bg-muted border-border text-foreground pr-8"
                    data-testid="input-employee-total-leave"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">일</span>
                </div>
              </div>

              {/* 수당 정책 설정 섹션 */}
              <div className="border border-border rounded-md p-3 space-y-3">
                <Label className="text-foreground text-sm font-medium">수당 정책 설정</Label>
                
                {/* 팀 오버라이딩율 - 팀장만 표시 */}
                {newEmployee.role === 'team_leader' && (
                  <div>
                    <Label className="text-muted-foreground text-sm">팀 오버라이딩율</Label>
                    <div className="relative mt-1">
                      <Input
                        type="number"
                        min="0"
                        max="100"
                        step="0.1"
                        value={newEmployee.commissionRates.teamOverride || ''}
                        onChange={(e) => setNewEmployee({
                          ...newEmployee,
                          commissionRates: {
                            ...newEmployee.commissionRates,
                            teamOverride: parseFloat(e.target.value) || 0,
                          },
                        })}
                        placeholder="0"
                        className="bg-muted border-border text-foreground pr-8"
                        data-testid="input-employee-team-override"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">%</span>
                    </div>
                  </div>
                )}

                {/* 유입 채널별 수당율 - 2x2 그리드 */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-muted-foreground text-sm">광고</Label>
                    <div className="relative mt-1">
                      <Input
                        type="number"
                        min="0"
                        max="100"
                        step="0.1"
                        value={newEmployee.commissionRates.ad || ''}
                        onChange={(e) => setNewEmployee({
                          ...newEmployee,
                          commissionRates: {
                            ...newEmployee.commissionRates,
                            ad: parseFloat(e.target.value) || 0,
                          },
                        })}
                        placeholder="0"
                        className="bg-muted border-border text-foreground pr-8"
                        data-testid="input-employee-commission-ad"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">%</span>
                    </div>
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-sm">고객소개</Label>
                    <div className="relative mt-1">
                      <Input
                        type="number"
                        min="0"
                        max="100"
                        step="0.1"
                        value={newEmployee.commissionRates.referral || ''}
                        onChange={(e) => setNewEmployee({
                          ...newEmployee,
                          commissionRates: {
                            ...newEmployee.commissionRates,
                            referral: parseFloat(e.target.value) || 0,
                          },
                        })}
                        placeholder="0"
                        className="bg-muted border-border text-foreground pr-8"
                        data-testid="input-employee-commission-referral"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">%</span>
                    </div>
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-sm">승인복제</Label>
                    <div className="relative mt-1">
                      <Input
                        type="number"
                        min="0"
                        max="100"
                        step="0.1"
                        value={newEmployee.commissionRates.reExecution || ''}
                        onChange={(e) => setNewEmployee({
                          ...newEmployee,
                          commissionRates: {
                            ...newEmployee.commissionRates,
                            reExecution: parseFloat(e.target.value) || 0,
                          },
                        })}
                        placeholder="0"
                        className="bg-muted border-border text-foreground pr-8"
                        data-testid="input-employee-commission-reexecution"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">%</span>
                    </div>
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-sm">외주</Label>
                    <div className="relative mt-1">
                      <Input
                        type="number"
                        min="0"
                        max="100"
                        step="0.1"
                        value={newEmployee.commissionRates.outsource || ''}
                        onChange={(e) => setNewEmployee({
                          ...newEmployee,
                          commissionRates: {
                            ...newEmployee.commissionRates,
                            outsource: parseFloat(e.target.value) || 0,
                          },
                        })}
                        placeholder="0"
                        className="bg-muted border-border text-foreground pr-8"
                        data-testid="input-employee-commission-outsource"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">%</span>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <Label className="text-muted-foreground text-sm">성명 *</Label>
                <Input
                  value={newEmployee.name}
                  onChange={(e) => setNewEmployee({ ...newEmployee, name: e.target.value })}
                  placeholder="홍길동"
                  className="bg-muted border-border text-foreground mt-1"
                  data-testid="input-employee-name"
                />
              </div>

              <div>
                <Label className="text-muted-foreground text-sm">구글 이메일 *</Label>
                <Input
                  type="email"
                  value={newEmployee.email}
                  onChange={(e) => setNewEmployee({ ...newEmployee, email: e.target.value })}
                  placeholder="example@gmail.com"
                  className="bg-muted border-border text-foreground mt-1"
                  data-testid="input-employee-email"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-muted-foreground text-sm">연락처(업무용)</Label>
                  <Input
                    value={newEmployee.phone_work}
                    onChange={(e) => {
                      const value = e.target.value.replace(/[^0-9]/g, '');
                      let formatted = value;
                      if (value.length > 3 && value.length <= 7) {
                        formatted = `${value.slice(0, 3)}-${value.slice(3)}`;
                      } else if (value.length > 7) {
                        formatted = `${value.slice(0, 3)}-${value.slice(3, 7)}-${value.slice(7, 11)}`;
                      }
                      setNewEmployee({ ...newEmployee, phone_work: formatted });
                    }}
                    maxLength={13}
                    placeholder="010-0000-0000"
                    className="bg-muted border-border text-foreground mt-1"
                    data-testid="input-employee-phone-work"
                  />
                </div>
                <div>
                  <Label className="text-muted-foreground text-sm">연락처(개인)</Label>
                  <Input
                    value={newEmployee.phone_personal}
                    onChange={(e) => {
                      const value = e.target.value.replace(/[^0-9]/g, '');
                      let formatted = value;
                      if (value.length > 3 && value.length <= 7) {
                        formatted = `${value.slice(0, 3)}-${value.slice(3)}`;
                      } else if (value.length > 7) {
                        formatted = `${value.slice(0, 3)}-${value.slice(3, 7)}-${value.slice(7, 11)}`;
                      }
                      setNewEmployee({ ...newEmployee, phone_personal: formatted });
                    }}
                    maxLength={13}
                    placeholder="010-0000-0000"
                    className="bg-muted border-border text-foreground mt-1"
                    data-testid="input-employee-phone-personal"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-muted-foreground text-sm">주민등록번호(앞)</Label>
                  <Input
                    value={newEmployee.ssn_front}
                    onChange={(e) => setNewEmployee({ ...newEmployee, ssn_front: e.target.value })}
                    placeholder="000000"
                    maxLength={6}
                    className="bg-muted border-border text-foreground mt-1"
                    data-testid="input-employee-ssn-front"
                  />
                </div>
                <div>
                  <Label className="text-muted-foreground text-sm">주민등록번호(뒤)</Label>
                  <Input
                    type="password"
                    value={newEmployee.ssn_back}
                    onChange={(e) => setNewEmployee({ ...newEmployee, ssn_back: e.target.value })}
                    placeholder="0000000"
                    maxLength={7}
                    className="bg-muted border-border text-foreground mt-1"
                    data-testid="input-employee-ssn-back"
                  />
                </div>
              </div>

              <div>
                <Label className="text-muted-foreground text-sm">거주지(주소)</Label>
                <Input
                  value={newEmployee.address}
                  onChange={(e) => setNewEmployee({ ...newEmployee, address: e.target.value })}
                  placeholder="주소를 입력하세요"
                  className="bg-muted border-border text-foreground mt-1"
                  data-testid="input-employee-address"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-muted-foreground text-sm">급여계좌 은행</Label>
                  <Input
                    value={newEmployee.bank_name}
                    onChange={(e) => setNewEmployee({ ...newEmployee, bank_name: e.target.value })}
                    placeholder="은행명"
                    className="bg-muted border-border text-foreground mt-1"
                    data-testid="input-employee-bank-name"
                  />
                </div>
                <div>
                  <Label className="text-muted-foreground text-sm">계좌번호</Label>
                  <Input
                    value={newEmployee.bank_account}
                    onChange={(e) => setNewEmployee({ ...newEmployee, bank_account: e.target.value })}
                    placeholder="계좌번호"
                    className="bg-muted border-border text-foreground mt-1"
                    data-testid="input-employee-bank-account"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setShowAddEmployee(false)}
                className="border-border text-muted-foreground"
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
      {showEditEmployee && editTargetUser && (
        <Dialog open={showEditEmployee} onOpenChange={setShowEditEmployee}>
          <DialogContent className="max-w-lg max-h-[85vh] bg-background border-border text-foreground overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-lg font-bold text-foreground flex items-center gap-2">
                <Pencil className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                직원 정보 수정
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label className="text-muted-foreground text-sm">입사일자</Label>
                  <Input
                    type="date"
                    value={editEmployee.hire_date}
                    onChange={(e) => setEditEmployee({ ...editEmployee, hire_date: e.target.value })}
                    className="bg-muted border-border text-foreground mt-1"
                    data-testid="input-edit-employee-hire-date"
                  />
                </div>

                <div>
                  <Label className="text-muted-foreground text-sm">직급</Label>
                  <Select
                    value={editEmployee.role}
                    onValueChange={(v) => setEditEmployee({ ...editEmployee, role: v as UserRole })}
                  >
                    <SelectTrigger className="bg-muted border-border text-foreground mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-popover border-border">
                      <SelectItem value="staff" className="text-foreground">팀원</SelectItem>
                      <SelectItem value="team_leader" className="text-foreground">팀장</SelectItem>
                      <SelectItem value="super_admin" className="text-foreground">총관리자</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-muted-foreground text-sm">소속 팀</Label>
                  {teams.filter(t => t.id && t.id.trim() !== '').length === 0 ? (
                    <div className="mt-1 p-2 bg-muted border border-border rounded-md text-muted-foreground text-sm">
                      팀 없음
                    </div>
                  ) : (
                    <Select
                      value={editEmployee.team_id || 'none'}
                      onValueChange={(v) => setEditEmployee({ ...editEmployee, team_id: v === 'none' ? '' : v })}
                    >
                      <SelectTrigger className="bg-muted border-border text-foreground mt-1">
                        <SelectValue placeholder="선택" />
                      </SelectTrigger>
                      <SelectContent className="bg-popover border-border">
                        <SelectItem value="none" className="text-muted-foreground">없음</SelectItem>
                        {teams
                          .filter((team) => team.id && team.id.trim() !== '' && team.team_id && team.team_id.trim() !== '')
                          .map((team) => (
                            <SelectItem key={team.id} value={team.id} className="text-foreground">
                              {team.team_name || team.name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </div>

              <div>
                <Label className="text-muted-foreground text-sm">연간 연차 개수</Label>
                <div className="relative mt-1">
                  <Input
                    type="number"
                    min="0"
                    max="30"
                    step="0.5"
                    value={editEmployee.totalLeave}
                    onChange={(e) => setEditEmployee({ ...editEmployee, totalLeave: parseFloat(e.target.value) || 0 })}
                    placeholder="15"
                    className="bg-muted border-border text-foreground pr-8"
                    data-testid="input-edit-employee-total-leave"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">일</span>
                </div>
              </div>

              {/* 수당 정책 설정 섹션 */}
              <div className="border border-border rounded-md p-3 space-y-3">
                <Label className="text-foreground text-sm font-medium">수당 정책 설정</Label>
                
                {/* 팀 오버라이딩율 - 팀장만 표시 */}
                {editEmployee.role === 'team_leader' && (
                  <div>
                    <Label className="text-muted-foreground text-sm">팀 오버라이딩율</Label>
                    <div className="relative mt-1">
                      <Input
                        type="number"
                        min="0"
                        max="100"
                        step="0.1"
                        value={editEmployee.commissionRates.teamOverride || ''}
                        onChange={(e) => setEditEmployee({
                          ...editEmployee,
                          commissionRates: {
                            ...editEmployee.commissionRates,
                            teamOverride: parseFloat(e.target.value) || 0,
                          },
                        })}
                        placeholder="0"
                        className="bg-muted border-border text-foreground pr-8"
                        data-testid="input-edit-employee-team-override"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">%</span>
                    </div>
                  </div>
                )}

                {/* 유입 채널별 수당율 */}
                <div className="space-y-3">
                  {/* 광고 */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-muted-foreground text-sm">광고 (자문료)</Label>
                      <div className="relative mt-1">
                        <Input
                          type="number"
                          min="0"
                          max="100"
                          step="0.1"
                          value={editEmployee.commissionRates.ad || ''}
                          onChange={(e) => setEditEmployee({
                            ...editEmployee,
                            commissionRates: {
                              ...editEmployee.commissionRates,
                              ad: parseFloat(e.target.value) || 0,
                            },
                          })}
                          placeholder="0"
                          className="bg-muted border-border text-foreground pr-8"
                          data-testid="input-edit-employee-commission-ad"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">%</span>
                      </div>
                    </div>
                    <div>
                      <Label className="text-muted-foreground text-sm">광고 (계약금)</Label>
                      <div className="relative mt-1">
                        <Input
                          type="number"
                          min="0"
                          max="100"
                          step="0.1"
                          value={editEmployee.commissionRates.adDeposit || ''}
                          onChange={(e) => setEditEmployee({
                            ...editEmployee,
                            commissionRates: {
                              ...editEmployee.commissionRates,
                              adDeposit: parseFloat(e.target.value) || 0,
                            },
                          })}
                          placeholder="0"
                          className="bg-muted border-border text-foreground pr-8"
                          data-testid="input-edit-employee-commission-ad-deposit"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">%</span>
                      </div>
                    </div>
                  </div>
                  
                  {/* 지인소개 */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-muted-foreground text-sm">지인소개 (자문료)</Label>
                      <div className="relative mt-1">
                        <Input
                          type="number"
                          min="0"
                          max="100"
                          step="0.1"
                          value={editEmployee.commissionRates.referral || ''}
                          onChange={(e) => setEditEmployee({
                            ...editEmployee,
                            commissionRates: {
                              ...editEmployee.commissionRates,
                              referral: parseFloat(e.target.value) || 0,
                            },
                          })}
                          placeholder="0"
                          className="bg-muted border-border text-foreground pr-8"
                          data-testid="input-edit-employee-commission-referral"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">%</span>
                      </div>
                    </div>
                    <div>
                      <Label className="text-muted-foreground text-sm">지인소개 (계약금)</Label>
                      <div className="relative mt-1">
                        <Input
                          type="number"
                          min="0"
                          max="100"
                          step="0.1"
                          value={editEmployee.commissionRates.referralDeposit || ''}
                          onChange={(e) => setEditEmployee({
                            ...editEmployee,
                            commissionRates: {
                              ...editEmployee.commissionRates,
                              referralDeposit: parseFloat(e.target.value) || 0,
                            },
                          })}
                          placeholder="0"
                          className="bg-muted border-border text-foreground pr-8"
                          data-testid="input-edit-employee-commission-referral-deposit"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">%</span>
                      </div>
                    </div>
                  </div>
                  
                  {/* 재집행/외주 */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-muted-foreground text-sm">재집행</Label>
                      <div className="relative mt-1">
                        <Input
                          type="number"
                          min="0"
                          max="100"
                          step="0.1"
                          value={editEmployee.commissionRates.reExecution || ''}
                          onChange={(e) => setEditEmployee({
                            ...editEmployee,
                            commissionRates: {
                              ...editEmployee.commissionRates,
                              reExecution: parseFloat(e.target.value) || 0,
                            },
                          })}
                          placeholder="0"
                          className="bg-muted border-border text-foreground pr-8"
                          data-testid="input-edit-employee-commission-reexecution"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">%</span>
                      </div>
                    </div>
                    <div>
                      <Label className="text-muted-foreground text-sm">외주</Label>
                      <div className="relative mt-1">
                        <Input
                          type="number"
                          min="0"
                          max="100"
                          step="0.1"
                          value={editEmployee.commissionRates.outsource || ''}
                          onChange={(e) => setEditEmployee({
                            ...editEmployee,
                            commissionRates: {
                              ...editEmployee.commissionRates,
                              outsource: parseFloat(e.target.value) || 0,
                            },
                          })}
                          placeholder="0"
                          className="bg-muted border-border text-foreground pr-8"
                          data-testid="input-edit-employee-commission-outsource"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">%</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <Label className="text-muted-foreground text-sm">성명 *</Label>
                <Input
                  value={editEmployee.name}
                  onChange={(e) => setEditEmployee({ ...editEmployee, name: e.target.value })}
                  placeholder="홍길동"
                  className="bg-muted border-border text-foreground mt-1"
                  data-testid="input-edit-employee-name"
                />
              </div>

              <div>
                <Label className="text-muted-foreground text-sm">구글 이메일 (변경 불가)</Label>
                <Input
                  value={editEmployee.email}
                  disabled
                  className="bg-muted border-border text-muted-foreground mt-1"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-muted-foreground text-sm">연락처(업무용)</Label>
                  <Input
                    value={editEmployee.phone_work}
                    onChange={(e) => {
                      const value = e.target.value.replace(/[^0-9]/g, '');
                      let formatted = value;
                      if (value.length > 3 && value.length <= 7) {
                        formatted = `${value.slice(0, 3)}-${value.slice(3)}`;
                      } else if (value.length > 7) {
                        formatted = `${value.slice(0, 3)}-${value.slice(3, 7)}-${value.slice(7, 11)}`;
                      }
                      setEditEmployee({ ...editEmployee, phone_work: formatted });
                    }}
                    maxLength={13}
                    placeholder="010-0000-0000"
                    className="bg-muted border-border text-foreground mt-1"
                    data-testid="input-edit-employee-phone-work"
                  />
                </div>
                <div>
                  <Label className="text-muted-foreground text-sm">연락처(개인)</Label>
                  <Input
                    value={editEmployee.phone_personal}
                    onChange={(e) => {
                      const value = e.target.value.replace(/[^0-9]/g, '');
                      let formatted = value;
                      if (value.length > 3 && value.length <= 7) {
                        formatted = `${value.slice(0, 3)}-${value.slice(3)}`;
                      } else if (value.length > 7) {
                        formatted = `${value.slice(0, 3)}-${value.slice(3, 7)}-${value.slice(7, 11)}`;
                      }
                      setEditEmployee({ ...editEmployee, phone_personal: formatted });
                    }}
                    maxLength={13}
                    placeholder="010-0000-0000"
                    className="bg-muted border-border text-foreground mt-1"
                    data-testid="input-edit-employee-phone-personal"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-muted-foreground text-sm">주민등록번호(앞)</Label>
                  <Input
                    value={editEmployee.ssn_front}
                    onChange={(e) => setEditEmployee({ ...editEmployee, ssn_front: e.target.value })}
                    placeholder="000000"
                    maxLength={6}
                    className="bg-muted border-border text-foreground mt-1"
                    data-testid="input-edit-employee-ssn-front"
                  />
                </div>
                <div>
                  <Label className="text-muted-foreground text-sm">주민등록번호(뒤)</Label>
                  <Input
                    type="password"
                    value={editEmployee.ssn_back}
                    onChange={(e) => setEditEmployee({ ...editEmployee, ssn_back: e.target.value })}
                    placeholder="0000000"
                    maxLength={7}
                    className="bg-muted border-border text-foreground mt-1"
                    data-testid="input-edit-employee-ssn-back"
                  />
                </div>
              </div>

              <div>
                <Label className="text-muted-foreground text-sm">거주지(주소)</Label>
                <Input
                  value={editEmployee.address}
                  onChange={(e) => setEditEmployee({ ...editEmployee, address: e.target.value })}
                  placeholder="주소를 입력하세요"
                  className="bg-muted border-border text-foreground mt-1"
                  data-testid="input-edit-employee-address"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-muted-foreground text-sm">급여계좌 은행</Label>
                  <Input
                    value={editEmployee.bank_name}
                    onChange={(e) => setEditEmployee({ ...editEmployee, bank_name: e.target.value })}
                    placeholder="은행명"
                    className="bg-muted border-border text-foreground mt-1"
                    data-testid="input-edit-employee-bank-name"
                  />
                </div>
                <div>
                  <Label className="text-muted-foreground text-sm">계좌번호</Label>
                  <Input
                    value={editEmployee.bank_account}
                    onChange={(e) => setEditEmployee({ ...editEmployee, bank_account: e.target.value })}
                    placeholder="계좌번호"
                    className="bg-muted border-border text-foreground mt-1"
                    data-testid="input-edit-employee-bank-account"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setShowEditEmployee(false)}
                className="border-border text-muted-foreground"
              >
                취소
              </Button>
              <Button
                onClick={handleUpdateEmployee}
                className="bg-blue-600 hover:bg-blue-700"
                data-testid="button-confirm-edit-employee"
              >
                저장
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent className="bg-background border-border text-foreground">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground">직원 삭제 확인</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              <span className="font-semibold text-red-600 dark:text-red-400">{deleteTargetUser?.name}</span> ({deleteTargetUser?.email}) 님을 화이트리스트에서 삭제하시겠습니까?
              <br />
              <span className="text-red-600 dark:text-red-400">삭제 시 해당 사용자는 더 이상 시스템에 접속할 수 없습니다.</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-muted border-border text-muted-foreground hover:bg-muted/80">
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
        <AlertDialogContent className="bg-background border-border text-foreground">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground">팀 삭제 확인</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              <span className="font-semibold text-red-600 dark:text-red-400">{deleteTargetTeam?.team_name || deleteTargetTeam?.name}</span> 팀을 삭제하시겠습니까?
              <br />
              <span className="text-yellow-600 dark:text-yellow-400">해당 팀 소속 직원들의 팀 정보가 '없음'으로 변경됩니다.</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-muted border-border text-muted-foreground hover:bg-muted/80">
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
      {showDistributionSettings && (
        <Dialog open={showDistributionSettings} onOpenChange={setShowDistributionSettings}>
          <DialogContent className="max-w-2xl max-h-[80vh] bg-background border-border text-foreground flex flex-col overflow-hidden">
            <DialogHeader className="shrink-0">
              <DialogTitle className="text-lg font-bold text-foreground flex items-center gap-2">
                <Settings2 className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                DB 분배 설정
              </DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground mb-4">
              직원별 일일 최대 DB 할당 수를 설정하고, 분배 ON/OFF를 관리합니다. (0 = 무제한)
            </p>
            <div className="flex-1 overflow-y-auto min-h-0">
              <Table>
                <TableHeader>
                  <TableRow className="border-border h-10">
                    <TableHead className="text-muted-foreground py-2">직원명</TableHead>
                    <TableHead className="text-muted-foreground py-2">소속팀</TableHead>
                    <TableHead className="text-muted-foreground py-2 text-center">DB 분배</TableHead>
                    <TableHead className="text-muted-foreground py-2 text-center">일일 최대 DB</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users
                    .filter((user) => user.status !== '퇴사')
                    .sort((a, b) => {
                      const teamA = teams.find(t => t.id === a.team_id);
                      const teamB = teams.find(t => t.id === b.team_id);
                      const teamNameA = teamA?.team_name || teamA?.name || '';
                      const teamNameB = teamB?.team_name || teamB?.name || '';
                      return teamNameA.localeCompare(teamNameB, 'ko');
                    })
                    .map((user) => {
                      const userId = user.docId || user.uid;
                      const settings = distributionSettings[userId] || { enabled: true, limit: 0 };
                      const team = teams.find(t => t.id === user.team_id);
                      return (
                        <TableRow key={userId} className="border-border h-12">
                          <TableCell className="text-foreground font-medium py-2">
                            {user.name}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm py-2">
                            {team?.team_name || team?.name || '-'}
                          </TableCell>
                          <TableCell className="py-2 text-center">
                            <Switch
                              checked={settings.enabled}
                              onCheckedChange={(checked) => {
                                setDistributionSettings((prev) => ({
                                  ...prev,
                                  [userId]: { ...settings, enabled: checked },
                                }));
                              }}
                              data-testid={`switch-distribution-${userId}`}
                            />
                          </TableCell>
                          <TableCell className="py-2 text-center">
                            <Input
                              type="number"
                              min="0"
                              max="100"
                              value={settings.limit}
                              onChange={(e) => {
                                const value = parseInt(e.target.value) || 0;
                                setDistributionSettings((prev) => ({
                                  ...prev,
                                  [userId]: { ...settings, limit: value },
                                }));
                              }}
                              disabled={!settings.enabled}
                              className={cn(
                                "w-20 h-8 text-center bg-muted border-border",
                                !settings.enabled && "opacity-50"
                              )}
                              data-testid={`input-db-limit-${userId}`}
                            />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                </TableBody>
              </Table>
            </div>
            <div className="flex justify-end gap-2 pt-4 shrink-0 border-t border-border mt-4">
              <Button
                variant="outline"
                onClick={() => setShowDistributionSettings(false)}
                className="border-border text-muted-foreground"
              >
                취소
              </Button>
              <Button
                onClick={handleSaveDistributionSettings}
                disabled={savingDistribution}
                className="bg-blue-600 hover:bg-blue-700"
                data-testid="button-save-distribution"
              >
                {savingDistribution ? '저장 중...' : '저장'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
