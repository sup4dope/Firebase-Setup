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
import {
  LayoutDashboard,
  Users,
  Settings,
  CalendarDays,
  LogOut,
  Building2,
} from 'lucide-react';
import { TodoList } from './TodoList';
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

  const navItems = [
    { href: '/', label: '대시보드', icon: LayoutDashboard },
    ...(userRole === 'super_admin' || userRole === 'team_leader'
      ? [{ href: '/teams', label: '팀 관리', icon: Users }]
      : []
    ),
    ...(userRole === 'super_admin' 
      ? [{ href: '/holidays', label: '공휴일 관리', icon: CalendarDays }]
      : []
    ),
    { href: '/settings', label: '설정', icon: Settings },
  ];

  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
            <Building2 className="w-5 h-5 text-primary-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="font-semibold text-sm truncate">정책자금 CRM</h1>
            <p className="text-xs text-muted-foreground truncate">Policy Fund Consulting</p>
          </div>
        </div>
      </SidebarHeader>

      <SidebarSeparator />

      <SidebarContent>
        {/* Navigation */}
        <SidebarGroup>
          <SidebarGroupLabel>메뉴</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map(item => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton 
                    asChild
                    isActive={location === item.href}
                    data-testid={`nav-${item.href.replace('/', '') || 'dashboard'}`}
                  >
                    <Link href={item.href}>
                      <item.icon className="w-4 h-4" />
                      <span>{item.label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator />

        {/* TODO List */}
        <SidebarGroup className="flex-1">
          <SidebarGroupContent className="px-2">
            <TodoList
              todos={todos}
              currentUserId={user.uid}
              userRole={userRole}
              onToggle={onToggleTodo}
              onDelete={onDeleteTodo}
              onAdd={onAddTodo}
            />
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarSeparator />

      <SidebarFooter className="p-4">
        <div className="flex items-center gap-3">
          <Avatar className="w-10 h-10">
            <AvatarFallback>{user.name.slice(0, 2)}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{user.name}</p>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                {ROLE_LABELS[userRole]}
              </Badge>
              {user.team_name && (
                <span className="text-xs text-muted-foreground truncate">
                  {user.team_name}
                </span>
              )}
            </div>
          </div>
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={onSignOut}
            data-testid="button-signout"
          >
            <LogOut className="w-4 h-4" />
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
