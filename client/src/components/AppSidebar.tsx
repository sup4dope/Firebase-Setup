import { useState } from 'react';
import { Link, useLocation } from 'wouter';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarSeparator,
} from '@/components/ui/sidebar';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Users,
  BarChart3,
  LogOut,
  Cog,
  Calculator,
  Landmark,
  CalendarDays,
  Trophy,
  FileSignature,
} from 'lucide-react';
import { SystemSettingsModal } from './SystemSettingsModal';
import { cn } from '@/lib/utils';

import type { User, UserRole } from '@shared/types';

interface AppSidebarProps {
  user: User;
  userRole: UserRole;
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
  onSignOut,
}: AppSidebarProps) {
  const [location] = useLocation();
  const [showSystemSettings, setShowSystemSettings] = useState(false);

  const mainMenuItems = [
    { href: '/', label: '고객관리', icon: Users, description: '고객 목록 및 퍼널', adminOnly: false },
    { href: '/stats', label: '통계', icon: BarChart3, description: 'KPI 및 리포트', adminOnly: false },
    { href: '/rankings', label: '매출랭킹', icon: Trophy, description: '개인/팀 실적 순위', adminOnly: false },
    { href: '/annual-leave', label: '연차관리', icon: CalendarDays, description: '연차 신청 및 승인', adminOnly: false },
    { href: '/contracts', label: '전자계약', icon: FileSignature, description: '계약서 발송 및 관리', adminOnly: false },
    { href: '/settlements', label: '정산관리', icon: Calculator, description: '수당 정산 및 환수', adminOnly: false },
    { href: '/company-settlement', label: '회사정산', icon: Landmark, description: '매출/비용 통합', adminOnly: true },
  ];

  const filteredMenuItems = mainMenuItems.filter(item => !item.adminOnly || userRole === 'super_admin');

  return (
    <Sidebar className="border-r border-border dark:border-gray-800">
      <SidebarHeader className="p-4 bg-muted/50 dark:bg-gray-900/50">
        <div className="flex items-center gap-3">
          <img 
            src="/assets/onlylogo_square_white-removebg-preview_1769003389420.png" 
            alt="MSGY Logo" 
            className="w-10 h-10 rounded-lg shadow-lg object-contain"
          />
          <div className="flex-1 min-w-0">
            <h1 className="font-bold text-sm text-foreground">MSGY CRM</h1>
            <p className="text-xs text-muted-foreground">Management Support Group Yieum</p>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent className="flex flex-col">
        <SidebarGroup className="p-3">
          <div className="space-y-2">
            {filteredMenuItems.map(item => {
              const isActive = item.href === '/' 
                ? location === '/' 
                : location.startsWith(item.href);
              
              return (
                <Link key={item.href} href={item.href}>
                  <Card
                    className={cn(
                      "p-4 cursor-pointer transition-all hover-elevate",
                      isActive 
                        ? "bg-blue-600/20 border-blue-500/50" 
                        : "bg-card dark:bg-gray-800/50"
                    )}
                    data-testid={`nav-${item.href.replace('/', '') || 'customers'}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "w-10 h-10 rounded-lg flex items-center justify-center",
                        isActive ? "bg-blue-600" : "bg-muted dark:bg-gray-700"
                      )}>
                        <item.icon className={cn(
                          "w-5 h-5",
                          isActive ? "text-white" : "text-muted-foreground dark:text-gray-300"
                        )} />
                      </div>
                      <div>
                        <p className={cn(
                          "font-semibold text-sm",
                          isActive ? "text-blue-600 dark:text-blue-400" : "text-foreground"
                        )}>
                          {item.label}
                        </p>
                        <p className="text-xs text-muted-foreground">{item.description}</p>
                      </div>
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>
        </SidebarGroup>

      </SidebarContent>
      <SidebarSeparator />
      <SidebarFooter className="p-4 bg-muted/30 dark:bg-gray-900/30 space-y-3">
        {userRole === 'super_admin' && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowSystemSettings(true)}
            className="w-full border-blue-500/50 text-blue-600 dark:text-blue-400"
            data-testid="button-system-settings"
          >
            <Cog className="w-4 h-4 mr-2" />
            인사관리
          </Button>
        )}

        <div className="flex items-center gap-3">
          <Avatar className="w-10 h-10 border-2 border-border">
            <AvatarFallback className="bg-gradient-to-br from-blue-600 to-purple-600 text-white">
              {user.name.slice(0, 2)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground truncate">{user.name}</p>
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
            className="text-muted-foreground hover:text-foreground"
            data-testid="button-signout"
          >
            <LogOut className="w-4 h-4" />
          </Button>
        </div>
      </SidebarFooter>
      {showSystemSettings && (
        <SystemSettingsModal
          isOpen={showSystemSettings}
          onClose={() => setShowSystemSettings(false)}
        />
      )}
    </Sidebar>
  );
}
