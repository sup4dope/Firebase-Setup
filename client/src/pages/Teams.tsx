import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useLocation } from 'wouter';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { TeamManagement } from '@/components/TeamManagement';
import {
  getTeams,
  getUsers,
  createTeam,
  updateTeam,
  deleteTeam,
  updateUser,
} from '@/lib/firestore';
import type { Team, User, UserRole } from '@shared/types';

export default function Teams() {
  const { user, isSuperAdmin, isTeamLeader } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [teams, setTeams] = useState<Team[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [formLoading, setFormLoading] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [fetchedTeams, fetchedUsers] = await Promise.all([
        getTeams(),
        getUsers(),
      ]);
      setTeams(fetchedTeams);
      setUsers(fetchedUsers);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast({
        title: '오류',
        description: '데이터를 불러오는 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  // Redirect if not authorized
  useEffect(() => {
    if (!isSuperAdmin && !isTeamLeader) {
      setLocation('/');
    }
  }, [isSuperAdmin, isTeamLeader, setLocation]);

  useEffect(() => {
    if (isSuperAdmin || isTeamLeader) {
      fetchData();
    }
  }, [isSuperAdmin, isTeamLeader]);

  const handleCreateTeam = async (data: { name: string }) => {
    setFormLoading(true);
    try {
      const newTeam = await createTeam(data);
      setTeams(prev => [...prev, newTeam]);
      toast({
        title: '성공',
        description: '팀이 생성되었습니다.',
      });
    } catch (error) {
      console.error('Error creating team:', error);
      toast({
        title: '오류',
        description: '팀 생성 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    } finally {
      setFormLoading(false);
    }
  };

  const handleUpdateTeam = async (id: string, data: { name: string }) => {
    setFormLoading(true);
    try {
      await updateTeam(id, data);
      setTeams(prev => prev.map(t => t.id === id ? { ...t, ...data } : t));
      // Update users' team_name
      setUsers(prev => prev.map(u => u.team_id === id ? { ...u, team_name: data.name } : u));
      toast({
        title: '성공',
        description: '팀이 수정되었습니다. 소속 데이터가 동기화되었습니다.',
      });
    } catch (error) {
      console.error('Error updating team:', error);
      toast({
        title: '오류',
        description: '팀 수정 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    } finally {
      setFormLoading(false);
    }
  };

  const handleDeleteTeam = async (id: string) => {
    const usersInTeam = users.filter(u => u.team_id === id);
    if (usersInTeam.length > 0) {
      toast({
        title: '삭제 불가',
        description: '팀에 소속된 사용자가 있어 삭제할 수 없습니다.',
        variant: 'destructive',
      });
      return;
    }

    if (!window.confirm('정말로 이 팀을 삭제하시겠습니까?')) return;

    try {
      await deleteTeam(id);
      setTeams(prev => prev.filter(t => t.id !== id));
      toast({
        title: '성공',
        description: '팀이 삭제되었습니다.',
      });
    } catch (error) {
      console.error('Error deleting team:', error);
      toast({
        title: '오류',
        description: '팀 삭제 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    }
  };

  const handleUpdateUserRole = async (userId: string, role: UserRole) => {
    try {
      await updateUser(userId, { role });
      setUsers(prev => prev.map(u => u.uid === userId ? { ...u, role } : u));
      toast({
        title: '성공',
        description: '사용자 권한이 변경되었습니다.',
      });
    } catch (error) {
      console.error('Error updating user role:', error);
      toast({
        title: '오류',
        description: '권한 변경 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    }
  };

  const handleUpdateUserTeam = async (userId: string, teamId: string, teamName: string) => {
    try {
      await updateUser(userId, { team_id: teamId || null, team_name: teamName || null });
      setUsers(prev => prev.map(u => 
        u.uid === userId ? { ...u, team_id: teamId || null, team_name: teamName || null } : u
      ));
      toast({
        title: '성공',
        description: '사용자 팀이 변경되었습니다.',
      });
    } catch (error) {
      console.error('Error updating user team:', error);
      toast({
        title: '오류',
        description: '팀 변경 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    }
  };

  // Don't render if not authorized
  if (!isSuperAdmin && !isTeamLeader) {
    return null;
  }

  if (loading) {
    return (
      <div className="p-6 space-y-6 max-w-5xl mx-auto">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">팀 관리</h1>
      <TeamManagement
        teams={teams}
        users={users}
        currentUserRole={user?.role || 'staff'}
        onCreateTeam={handleCreateTeam}
        onUpdateTeam={handleUpdateTeam}
        onDeleteTeam={handleDeleteTeam}
        onUpdateUserRole={handleUpdateUserRole}
        onUpdateUserTeam={handleUpdateUserTeam}
        isLoading={formLoading}
      />
    </div>
  );
}
