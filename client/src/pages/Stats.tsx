import { useState, useEffect, useMemo } from 'react';
import { format, startOfMonth, endOfMonth, parseISO, isWithinInterval, startOfDay, endOfDay, eachDayOfInterval } from 'date-fns';
import { ko } from 'date-fns/locale';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Users,
  TrendingUp,
  CheckCircle2,
  Clock,
  Target,
  CalendarIcon,
  RefreshCw,
  BarChart3,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { getCustomers, getTeams, getUsers, getStatusLogs } from '@/lib/firestore';
import type { Customer, Team, User, StatusLog } from '@shared/types';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LineChart,
  Line,
  FunnelChart,
  Funnel,
  LabelList,
  Cell,
} from 'recharts';

const CONTRACT_STATUSES = ['계약완료(선불)', '계약완료(외주)', '계약완료(후불)'];
const EXECUTION_STATUS = '집행완료';

// 금액 포맷팅: 만원 단위 입력 → 큰 숫자는 억원 자동 변환
function formatAmount(amountInManwon: number): { value: string; unit: string } {
  if (amountInManwon >= 10000) {
    // 1억 이상이면 억원으로 표시
    return { value: (amountInManwon / 10000).toFixed(1), unit: '억원' };
  }
  return { value: amountInManwon.toLocaleString(), unit: '만원' };
}

export default function Stats() {
  const { user, isSuperAdmin, isTeamLeader } = useAuth();
  const [loading, setLoading] = useState(true);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [statusLogs, setStatusLogs] = useState<StatusLog[]>([]);

  const [dateRange, setDateRange] = useState<{ from: Date | undefined; to: Date | undefined }>({
    from: undefined,
    to: undefined,
  });
  const [selectedTeam, setSelectedTeam] = useState<string>('all');
  const [selectedStaff, setSelectedStaff] = useState<string>('all');

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [fetchedCustomers, fetchedTeams, fetchedUsers, fetchedLogs] = await Promise.all([
          getCustomers(),
          getTeams(),
          getUsers(),
          getStatusLogs(),
        ]);
        setCustomers(fetchedCustomers);
        setTeams(fetchedTeams);
        setUsers(fetchedUsers);
        setStatusLogs(fetchedLogs);
      } catch (error) {
        console.error('Error fetching stats data:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  // 유효한 팀 목록 (id가 존재하는 팀만)
  const validTeams = useMemo(() => {
    return teams.filter(t => t.id && t.id.trim() !== '');
  }, [teams]);

  // 유효한 직원 목록 (uid가 존재하는 직원만)
  const filteredStaffOptions = useMemo(() => {
    let filtered = users.filter(u => u.uid && u.uid.trim() !== '');
    if (selectedTeam === 'all') {
      return filtered.filter(u => u.role !== 'super_admin' || isSuperAdmin);
    }
    return filtered.filter(u => u.team_id === selectedTeam);
  }, [users, selectedTeam, isSuperAdmin]);

  const filteredCustomers = useMemo(() => {
    let filtered = customers;

    if (dateRange.from && dateRange.to) {
      filtered = filtered.filter(c => {
        const entryDate = parseISO(c.entry_date);
        return isWithinInterval(entryDate, { 
          start: startOfDay(dateRange.from!), 
          end: endOfDay(dateRange.to!) 
        });
      });
    }

    if (!isSuperAdmin) {
      if (isTeamLeader && user?.team_id) {
        filtered = filtered.filter(c => c.team_id === user.team_id);
      } else if (user?.uid) {
        filtered = filtered.filter(c => c.manager_id === user.uid);
      }
    } else {
      if (selectedTeam !== 'all') {
        filtered = filtered.filter(c => c.team_id === selectedTeam);
      }
      if (selectedStaff !== 'all') {
        filtered = filtered.filter(c => c.manager_id === selectedStaff);
      }
    }

    return filtered;
  }, [customers, dateRange, selectedTeam, selectedStaff, isSuperAdmin, isTeamLeader, user]);

  const customerIdsWithContractHistory = useMemo(() => {
    const contractedIds = new Set<string>();
    
    statusLogs.forEach(log => {
      if (CONTRACT_STATUSES.includes(log.new_status)) {
        contractedIds.add(log.customer_id);
      }
    });

    filteredCustomers.forEach(c => {
      if (CONTRACT_STATUSES.includes(c.status_code)) {
        contractedIds.add(c.id);
      }
    });

    return contractedIds;
  }, [statusLogs, filteredCustomers]);

  const metrics = useMemo(() => {
    const totalInflow = filteredCustomers.length;
    
    // 계약 성과: 계약 이력이 있는 고객들
    const contractedCustomers = filteredCustomers.filter(c => 
      customerIdsWithContractHistory.has(c.id)
    );
    const contractedCount = contractedCustomers.length;
    const contractRate = totalInflow > 0 ? (contractedCount / totalInflow) * 100 : 0;
    
    // 계약 성과 추가 지표: deposit_amount 합계 (만원 단위), contract_fee_rate 평균
    const totalDepositAmount = contractedCustomers.reduce((sum, c) => 
      sum + (c.deposit_amount || 0), 0
    );
    const validFeeRates = contractedCustomers.filter(c => 
      c.contract_fee_rate && c.contract_fee_rate > 0
    );
    const avgContractFeeRate = validFeeRates.length > 0 
      ? validFeeRates.reduce((sum, c) => sum + (c.contract_fee_rate || 0), 0) / validFeeRates.length 
      : 0;

    // 집행 완료: 현재 상태가 '집행완료'인 고객들
    const executedCustomers = filteredCustomers.filter(c => c.status_code === EXECUTION_STATUS);
    const executedCount = executedCustomers.length;
    // execution_amount는 만원 단위로 저장
    const totalExecutionAmount = executedCustomers.reduce((sum, c) => 
      sum + (c.execution_amount || 0), 0
    );

    // 집행 예정: 계약완료(선불/후불/외주) 또는 신청완료 상태
    const pendingExecutionCustomers = filteredCustomers.filter(c => 
      CONTRACT_STATUSES.includes(c.status_code) || c.status_code === '신청완료'
    );
    const pendingExecutionCount = pendingExecutionCustomers.length;
    // 집행 예정 고객들의 예상 집행금액(contract_amount 또는 approved_amount 기반)
    const avgPendingExecutionAmount = pendingExecutionCount > 0
      ? pendingExecutionCustomers.reduce((sum, c) => {
          // contract_amount가 있으면 사용, 없으면 approved_amount/10000 (원→만원 변환)
          const amount = c.contract_amount || (c.approved_amount ? c.approved_amount / 10000 : 0);
          return sum + amount;
        }, 0) / pendingExecutionCount
      : 0;

    const avgConversionRate = totalInflow > 0 ? (executedCount / totalInflow) * 100 : 0;

    return {
      totalInflow,
      contractRate,
      contractedCount,
      totalDepositAmount,
      avgContractFeeRate,
      executedCount,
      totalExecutionAmount,
      pendingExecutionCount,
      avgPendingExecutionAmount,
      avgConversionRate,
    };
  }, [filteredCustomers, customerIdsWithContractHistory]);

  const funnelData = useMemo(() => {
    const waitingCount = filteredCustomers.filter(c => c.status_code === '상담대기').length;
    const contractedCount = filteredCustomers.filter(c => customerIdsWithContractHistory.has(c.id)).length;
    const applicationCount = filteredCustomers.filter(c => 
      c.status_code === '신청완료' || c.status_code === EXECUTION_STATUS
    ).length;
    const executedCount = filteredCustomers.filter(c => c.status_code === EXECUTION_STATUS).length;

    return [
      { name: '상담대기', value: waitingCount, fill: '#6366f1' },
      { name: '계약완료(이력)', value: contractedCount, fill: '#8b5cf6' },
      { name: '신청완료', value: applicationCount, fill: '#a855f7' },
      { name: '집행완료', value: executedCount, fill: '#22c55e' },
    ];
  }, [filteredCustomers, customerIdsWithContractHistory]);

  const performanceData = useMemo(() => {
    const staffStats: { [key: string]: { name: string; contracts: number; amount: number } } = {};

    const targetUsers = selectedTeam === 'all' 
      ? users.filter(u => u.role !== 'super_admin')
      : users.filter(u => u.team_id === selectedTeam && u.role !== 'super_admin');

    targetUsers.forEach(u => {
      staffStats[u.uid] = { name: u.name, contracts: 0, amount: 0 };
    });

    filteredCustomers.forEach(c => {
      if (staffStats[c.manager_id]) {
        if (customerIdsWithContractHistory.has(c.id)) {
          staffStats[c.manager_id].contracts += 1;
        }
        if (c.status_code === EXECUTION_STATUS) {
          // execution_amount는 만원 단위로 저장
          staffStats[c.manager_id].amount += c.execution_amount || 0;
        }
      }
    });

    return Object.values(staffStats).filter(s => s.contracts > 0 || s.amount > 0);
  }, [filteredCustomers, users, selectedTeam, customerIdsWithContractHistory]);

  const trendData = useMemo(() => {
    if (!dateRange.from || !dateRange.to) {
      const now = new Date();
      const monthStart = startOfMonth(now);
      const monthEnd = endOfMonth(now);
      const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

      return days.map(day => {
        const dayStr = format(day, 'yyyy-MM-dd');
        const inflowCount = filteredCustomers.filter(c => c.entry_date === dayStr).length;
        const contractCount = filteredCustomers.filter(c => 
          c.entry_date === dayStr && customerIdsWithContractHistory.has(c.id)
        ).length;

        return {
          date: format(day, 'MM/dd'),
          유입: inflowCount,
          계약: contractCount,
        };
      });
    }

    const days = eachDayOfInterval({ start: dateRange.from, end: dateRange.to });
    return days.map(day => {
      const dayStr = format(day, 'yyyy-MM-dd');
      const inflowCount = filteredCustomers.filter(c => c.entry_date === dayStr).length;
      const contractCount = filteredCustomers.filter(c => 
        c.entry_date === dayStr && customerIdsWithContractHistory.has(c.id)
      ).length;

      return {
        date: format(day, 'MM/dd'),
        유입: inflowCount,
        계약: contractCount,
      };
    });
  }, [filteredCustomers, dateRange, customerIdsWithContractHistory]);

  const resetFilters = () => {
    setDateRange({ from: undefined, to: undefined });
    setSelectedTeam('all');
    setSelectedStaff('all');
  };

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-5 gap-4">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
        <div className="grid grid-cols-2 gap-6">
          <Skeleton className="h-80" />
          <Skeleton className="h-80" />
        </div>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <BarChart3 className="w-6 h-6" />
            통계 대시보드
          </h1>

          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <Label className="text-sm text-muted-foreground whitespace-nowrap">접수일자</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "justify-start text-left font-normal min-w-[220px]",
                      !dateRange.from && "text-muted-foreground"
                    )}
                    data-testid="button-date-range"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateRange.from ? (
                      dateRange.to ? (
                        <>
                          {format(dateRange.from, 'yy.MM.dd')} - {format(dateRange.to, 'yy.MM.dd')}
                        </>
                      ) : (
                        format(dateRange.from, 'yy.MM.dd')
                      )
                    ) : (
                      <span>전체 기간</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="end">
                  <Calendar
                    mode="range"
                    selected={{ from: dateRange.from, to: dateRange.to }}
                    onSelect={(range) => setDateRange({ from: range?.from, to: range?.to })}
                    numberOfMonths={2}
                    locale={ko}
                  />
                </PopoverContent>
              </Popover>
            </div>

            {isSuperAdmin && (
              <>
                <div className="flex items-center gap-2">
                  <Label className="text-sm text-muted-foreground whitespace-nowrap">소속팀</Label>
                  <Select value={selectedTeam || 'all'} onValueChange={setSelectedTeam}>
                    <SelectTrigger className="w-[140px]" data-testid="select-team">
                      <SelectValue placeholder="전체 팀" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">전체 팀</SelectItem>
                      {validTeams.map(team => (
                        <SelectItem key={team.id} value={team.id}>
                          {team.team_name || team.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center gap-2">
                  <Label className="text-sm text-muted-foreground whitespace-nowrap">담당자</Label>
                  <Select value={selectedStaff || 'all'} onValueChange={setSelectedStaff}>
                    <SelectTrigger className="w-[140px]" data-testid="select-staff">
                      <SelectValue placeholder="전체 직원" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">전체 직원</SelectItem>
                      {filteredStaffOptions.map(staff => (
                        <SelectItem key={staff.uid} value={staff.uid}>
                          {staff.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}

            <Button variant="ghost" size="icon" onClick={resetFilters} data-testid="button-reset-filters">
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {/* 1. 총 유입 */}
          <Card className="bg-gradient-to-br from-indigo-500/10 to-indigo-600/5 border-indigo-500/20">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">총 유입</p>
                  <p className="text-3xl font-bold text-foreground">{metrics.totalInflow.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground mt-1">건</p>
                </div>
                <Users className="w-10 h-10 text-indigo-500 opacity-80" />
              </div>
            </CardContent>
          </Card>

          {/* 2. 계약 성과 */}
          <Card className="bg-gradient-to-br from-violet-500/10 to-violet-600/5 border-violet-500/20">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">계약률</p>
                  <p className="text-3xl font-bold text-foreground">{metrics.contractRate.toFixed(1)}%</p>
                  <p className="text-xs text-muted-foreground mt-1">{metrics.contractedCount}건 계약</p>
                </div>
                <TrendingUp className="w-10 h-10 text-violet-500 opacity-80" />
              </div>
              {/* 보조 지표: 총 계약금액, 평균 자문료율 */}
              <div className="mt-3 pt-3 border-t border-violet-500/10 space-y-1">
                <p className="text-xs text-gray-500">
                  총 계약금액: {formatAmount(metrics.totalDepositAmount).value} {formatAmount(metrics.totalDepositAmount).unit}
                </p>
                <p className="text-xs text-gray-500">
                  평균 자문료: {metrics.avgContractFeeRate.toFixed(1)}%
                </p>
              </div>
            </CardContent>
          </Card>

          {/* 3. 집행 완료 */}
          <Card className="bg-gradient-to-br from-emerald-500/10 to-emerald-600/5 border-emerald-500/20">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">집행완료</p>
                  <p className="text-3xl font-bold text-foreground">{metrics.executedCount.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground mt-1">건</p>
                </div>
                <CheckCircle2 className="w-10 h-10 text-emerald-500 opacity-80" />
              </div>
              {/* 보조 지표: 총 집행금액 */}
              <div className="mt-3 pt-3 border-t border-emerald-500/10">
                <p className="text-xs text-gray-500">
                  총 집행금액: {formatAmount(metrics.totalExecutionAmount).value} {formatAmount(metrics.totalExecutionAmount).unit}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* 4. 집행 예정 (신규) */}
          <Card className="bg-gradient-to-br from-amber-500/10 to-amber-600/5 border-amber-500/20">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">집행 예정</p>
                  <p className="text-3xl font-bold text-foreground">{metrics.pendingExecutionCount.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground mt-1">건</p>
                </div>
                <Clock className="w-10 h-10 text-amber-500 opacity-80" />
              </div>
              {/* 보조 지표: 평균 예상 집행금액 */}
              <div className="mt-3 pt-3 border-t border-amber-500/10">
                <p className="text-xs text-gray-500">
                  평균 예상금액: {formatAmount(metrics.avgPendingExecutionAmount).value} {formatAmount(metrics.avgPendingExecutionAmount).unit}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* 5. 평균 전환율 */}
          <Card className="bg-gradient-to-br from-rose-500/10 to-rose-600/5 border-rose-500/20">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">평균 전환율</p>
                  <p className="text-3xl font-bold text-foreground">{metrics.avgConversionRate.toFixed(1)}%</p>
                  <p className="text-xs text-muted-foreground mt-1">유입→집행</p>
                </div>
                <Target className="w-10 h-10 text-rose-500 opacity-80" />
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">전환 퍼널</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={funnelData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                    <YAxis 
                      type="category" 
                      dataKey="name" 
                      stroke="hsl(var(--muted-foreground))" 
                      fontSize={12}
                      width={100}
                    />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                      }}
                      labelStyle={{ color: 'hsl(var(--foreground))' }}
                    />
                    <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                      {funnelData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">담당자별 성과</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[300px]">
                {performanceData.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-muted-foreground">
                    데이터가 없습니다
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={performanceData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis 
                        dataKey="name" 
                        stroke="hsl(var(--muted-foreground))" 
                        fontSize={11}
                        angle={-45}
                        textAnchor="end"
                        height={60}
                      />
                      <YAxis 
                        yAxisId="left" 
                        stroke="#8b5cf6" 
                        fontSize={12}
                        label={{ value: '계약(건)', angle: -90, position: 'insideLeft', style: { fill: '#8b5cf6' } }}
                      />
                      <YAxis 
                        yAxisId="right" 
                        orientation="right" 
                        stroke="#22c55e" 
                        fontSize={12}
                        tickFormatter={(v) => v >= 10000 ? `${(v / 10000).toFixed(0)}억` : `${v.toLocaleString()}만`}
                        label={{ value: '금액', angle: 90, position: 'insideRight', style: { fill: '#22c55e' } }}
                      />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: 'hsl(var(--card))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px',
                        }}
                        labelStyle={{ color: 'hsl(var(--foreground))' }}
                        formatter={(value: number, name: string) => {
                          if (name === 'amount') {
                            const formatted = formatAmount(value);
                            return [`${formatted.value} ${formatted.unit}`, '집행금액'];
                          }
                          return [value, '계약건수'];
                        }}
                      />
                      <Legend />
                      <Bar yAxisId="left" dataKey="contracts" name="계약건수" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                      <Bar yAxisId="right" dataKey="amount" name="집행금액" fill="#22c55e" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">일별 추이 분석</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis 
                    dataKey="date" 
                    stroke="hsl(var(--muted-foreground))" 
                    fontSize={11}
                    interval="preserveStartEnd"
                  />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                    }}
                    labelStyle={{ color: 'hsl(var(--foreground))' }}
                  />
                  <Legend />
                  <Line 
                    type="monotone" 
                    dataKey="유입" 
                    stroke="#6366f1" 
                    strokeWidth={2}
                    dot={{ fill: '#6366f1', strokeWidth: 2 }}
                    activeDot={{ r: 6 }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="계약" 
                    stroke="#22c55e" 
                    strokeWidth={2}
                    dot={{ fill: '#22c55e', strokeWidth: 2 }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>
    </ScrollArea>
  );
}
