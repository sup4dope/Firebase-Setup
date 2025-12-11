import { useState } from 'react';
import { Link, useLocation } from 'wouter';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from '@/components/ui/sidebar';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card } from '@/components/ui/card';
import {
  Users,
  BarChart3,
  Settings,
  LogOut,
  Building2,
  Bell,
  Clock,
  Crown,
} from 'lucide-react';
import { TodoList } from './TodoList';
import { cn } from '@/lib/utils';
import { promoteToAdmin } from '@/lib/firestore';
import type { User, Todo, Customer, UserRole } from '@shared/types';

interface AppSidebarProps {
  user: User;
  userRole: UserRole;
  todos: Todo[];
  customers: Customer[];
  onToggleTodo: (todoId: string, completed: boolean) => void;
  onDeleteTodo: (todoId: string) => void;
  onAddTodo: () => void;
  onSignOut: () => void;
}

const ROLE_LABELS: Record<UserRole, string> = {
  staff: '팀원',
  team_leader: '팀장',
  super_admin: '총관리자',
};

interface ReservationMemo {
  id: string;
  customer_name: string;
  date: string;
  time: string;
  content: string;
}

export function AppSidebar({
  user,
  userRole,
  todos,
  customers,
  onToggleTodo,
  onDeleteTodo,
  onAddTodo,
  onSignOut,
}: AppSidebarProps) {
  const [location] = useLocation();
  const [isPromoting, setIsPromoting] = useState(false);

  const handlePromoteToAdmin = async () => {
    if (isPromoting) return;
    setIsPromoting(true);
    try {
      await promoteToAdmin(user.uid);
      alert('관리자 권한이 부여되었습니다. 새로고침하세요.');
    } catch (error) {
      console.error('Error promoting to admin:', error);
      alert('권한 변경 중 오류가 발생했습니다.');
    } finally {
      setIsPromoting(false);
    }
  };

  const mainMenuItems = [
    { href: '/', label: '고객관리', icon: Users, description: '고객 목록 및 퍼널' },
    { href: '/stats', label: '통계', icon: BarChart3, description: 'KPI 및 리포트' },
    { href: '/settings', label: '정보관리', icon: Settings, description: '팀/공휴일 설정' },
  ];

  const reservationMemos: ReservationMemo[] = [];

  return (
    <Sidebar className="border-r border-gray-800">
      <SidebarHeader className="p-4 bg-gray-900/50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-purple-600 rounded-lg flex items-center justify-center shadow-lg">
            <Building2 className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="font-bold text-sm text-gray-100">정책자금 CRM</h1>
            <p className="text-xs text-gray-500">Policy Fund Consulting</p>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent className="flex flex-col">
        {/* Main Menu - 3 Big Buttons */}
        <SidebarGroup className="p-3">
          <div className="space-y-2">
            {mainMenuItems.map(item => {
              const isActive = item.href === '/' 
                ? location === '/' 
                : location.startsWith(item.href);
              
              return (
                <Link key={item.href} href={item.href}>
                  <Card
                    className={cn(
                      "p-4 cursor-pointer transition-all border-gray-700 hover-elevate",
                      isActive 
                        ? "bg-blue-600/20 border-blue-500/50" 
                        : "bg-gray-800/50 hover:bg-gray-800"
                    )}
                    data-testid={`nav-${item.href.replace('/', '') || 'customers'}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "w-10 h-10 rounded-lg flex items-center justify-center",
                        isActive ? "bg-blue-600" : "bg-gray-700"
                      )}>
                        <item.icon className={cn(
                          "w-5 h-5",
                          isActive ? "text-white" : "text-gray-300"
                        )} />
                      </div>
                      <div>
                        <p className={cn(
                          "font-semibold text-sm",
                          isActive ? "text-blue-400" : "text-gray-200"
                        )}>
                          {item.label}
                        </p>
                        <p className="text-xs text-gray-500">{item.description}</p>
                      </div>
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>
        </SidebarGroup>

        <SidebarSeparator className="bg-gray-700" />

        {/* TODO List Section */}
        <SidebarGroup className="flex-1 overflow-hidden">
          <SidebarGroupLabel className="text-gray-400 px-4 flex items-center gap-2">
            <Clock className="w-4 h-4" />
            TO-DO 리스트
          </SidebarGroupLabel>
          <SidebarGroupContent className="px-3 overflow-hidden">
            <ScrollArea className="h-[200px]">
              <TodoList
                todos={todos}
                currentUserId={user.uid}
                userRole={userRole}
                onToggle={onToggleTodo}
                onDelete={onDeleteTodo}
                onAdd={onAddTodo}
              />
            </ScrollArea>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator className="bg-gray-700" />

        {/* Reservation Memo Section */}
        <SidebarGroup className="flex-1 overflow-hidden">
          <SidebarGroupLabel className="text-gray-400 px-4 flex items-center gap-2">
            <Bell className="w-4 h-4" />
            예약 대기
          </SidebarGroupLabel>
          <SidebarGroupContent className="px-3">
            <ScrollArea className="h-[150px]">
              {reservationMemos.length === 0 ? (
                <div className="text-center py-6">
                  <Bell className="w-8 h-8 mx-auto text-gray-600 mb-2" />
                  <p className="text-xs text-gray-500">예약된 메모가 없습니다</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {reservationMemos.map(memo => (
                    <Card 
                      key={memo.id} 
                      className="p-3 bg-gray-800/50 border-gray-700 cursor-pointer hover-elevate"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-gray-200 truncate">
                            {memo.customer_name}
                          </p>
                          <p className="text-xs text-gray-500 truncate">{memo.content}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-gray-400">{memo.date}</p>
                          <p className="text-xs text-blue-400">{memo.time}</p>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </ScrollArea>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarSeparator className="bg-gray-700" />

      <SidebarFooter className="p-4 bg-gray-900/30 space-y-3">
        {/* DEV ONLY: Admin Promote Button */}
        {userRole !== 'super_admin' && (
          <Button
            variant="outline"
            size="sm"
            onClick={handlePromoteToAdmin}
            disabled={isPromoting}
            className="w-full border-red-500/50 text-red-400 hover:bg-red-500/10 hover:text-red-300"
            data-testid="button-promote-admin"
          >
            <Crown className="w-4 h-4 mr-2" />
            {isPromoting ? '처리 중...' : '관리자 권한 획득'}
          </Button>
        )}
        
        <div className="flex items-center gap-3">
          <Avatar className="w-10 h-10 border-2 border-gray-700">
            <AvatarFallback className="bg-gradient-to-br from-blue-600 to-purple-600 text-white">
              {user.name.slice(0, 2)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-200 truncate">{user.name}</p>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-gray-700 text-gray-300">
                {ROLE_LABELS[userRole]}
              </Badge>
              {user.team_name && (
                <span className="text-xs text-gray-500 truncate">
                  {user.team_name}
                </span>
              )}
            </div>
          </div>
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={onSignOut}
            className="text-gray-400 hover:text-gray-200"
            data-testid="button-signout"
          >
            <LogOut className="w-4 h-4" />
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
