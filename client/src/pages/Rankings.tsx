import { useState, useEffect, useMemo } from 'react';
import { format, startOfMonth, endOfMonth, startOfYear } from 'date-fns';
import { ko } from 'date-fns/locale';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Trophy,
  Medal,
  Award,
  TrendingUp,
  Users,
  User,
  Crown,
  Star,
  HelpCircle,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { getCustomers, getUsers, getTeams } from '@/lib/firestore';
import type { Customer, User as UserType, Team } from '@shared/types';

type PeriodType = 'month' | 'H1' | 'H2' | 'year';

const parsePeriod = (period: string): { type: PeriodType; year: number; month?: number } => {
  if (period.endsWith('-H1')) {
    return { type: 'H1', year: parseInt(period.slice(0, 4)) };
  }
  if (period.endsWith('-H2')) {
    return { type: 'H2', year: parseInt(period.slice(0, 4)) };
  }
  if (period.endsWith('-Y')) {
    return { type: 'year', year: parseInt(period.slice(0, 4)) };
  }
  const [year, month] = period.split('-').map(Number);
  return { type: 'month', year, month };
};

const getPeriodLabel = (period: string): string => {
  const { type, year, month } = parsePeriod(period);
  if (type === 'H1') return `${year}년 상반기`;
  if (type === 'H2') return `${year}년 하반기`;
  if (type === 'year') return `${year}년`;
  return format(new Date(year, (month || 1) - 1, 1), 'yyyy년 M월', { locale: ko });
};

const isPeriodSummary = (period: string): boolean => {
  return period.endsWith('-H1') || period.endsWith('-H2') || period.endsWith('-Y');
};

interface ContractScore {
  customerId: string;
  customerName: string;
  companyName: string;
  managerId: string;
  managerName: string;
  teamId: string;
  teamName: string;
  processingOrg: string;
  executionAmount: number;
  executionDate: string;
  baseScore: number;
  categoryBonus: number;
  amountBonus: number;
  totalScore: number;
}

interface RankingEntry {
  id: string;
  name: string;
  teamName?: string;
  contractCount: number;
  totalScore: number;
  breakdown: {
    baseScore: number;
    categoryBonus: number;
    amountBonus: number;
  };
}

const CATEGORY_BONUS: Record<string, number> = {
  '신보': 30,
  '기보': 30,
  '중진공': 30,
  '농신보': 30,
  '기업인증': 30,
  '기타': 30,
  '일시적': 20,
  '상생': 20,
  '재도전': 10,
  '혁신': 10,
  '미소금융': 10,
  '신용취약': 0,
  '지역재단': 0,
  '미등록': 0,
};

const getAmountBonus = (amount: number): number => {
  if (amount <= 0) return 0;
  if (amount >= 15000) return 40;
  if (amount >= 10000) return 30;
  if (amount >= 5000) return 20;
  return 10;
};

const calculateContractScore = (
  processingOrg: string,
  executionAmount: number
): { baseScore: number; categoryBonus: number; amountBonus: number; totalScore: number } => {
  const baseScore = 20;
  const categoryBonus = CATEGORY_BONUS[processingOrg] ?? 0;
  const amountBonus = getAmountBonus(executionAmount);
  const totalScore = baseScore + categoryBonus + amountBonus;
  return { baseScore, categoryBonus, amountBonus, totalScore };
};

const getRankIcon = (rank: number) => {
  switch (rank) {
    case 1:
      return <Crown className="w-5 h-5 text-yellow-500" />;
    case 2:
      return <Medal className="w-5 h-5 text-gray-400" />;
    case 3:
      return <Award className="w-5 h-5 text-amber-600" />;
    default:
      return <span className="w-5 h-5 flex items-center justify-center text-sm font-medium text-muted-foreground">{rank}</span>;
  }
};

const getRankBadgeColor = (rank: number): string => {
  switch (rank) {
    case 1:
      return 'bg-yellow-500/20 text-yellow-600 dark:text-yellow-400 border-yellow-500/50';
    case 2:
      return 'bg-gray-400/20 text-gray-600 dark:text-gray-300 border-gray-400/50';
    case 3:
      return 'bg-amber-600/20 text-amber-700 dark:text-amber-400 border-amber-600/50';
    default:
      return 'bg-muted text-muted-foreground';
  }
};

export default function Rankings() {
  const { user } = useAuth();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [users, setUsers] = useState<UserType[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPeriod, setSelectedPeriod] = useState(() => format(new Date(), 'yyyy-MM'));
  const [periodPickerOpen, setPeriodPickerOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'individual' | 'team'>('individual');

  const monthOptions = useMemo(() => {
    const options: string[] = [];
    const now = new Date();

    for (let i = 0; i < 24; i++) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const year = date.getFullYear();
      const month = date.getMonth() + 1;
      const monthStr = format(date, 'yyyy-MM');
      
      if (month === 12) {
        options.push(`${year}-Y`);
        options.push(`${year}-H2`);
      }
      
      if (month === 6) {
        options.push(`${year}-H1`);
      }
      
      options.push(monthStr);
    }
    return options;
  }, []);

  const handlePrevPeriod = () => {
    if (isPeriodSummary(selectedPeriod)) return;
    const [year, month] = selectedPeriod.split('-').map(Number);
    const prevDate = new Date(year, month - 2, 1);
    setSelectedPeriod(format(prevDate, 'yyyy-MM'));
  };

  const handleNextPeriod = () => {
    if (isPeriodSummary(selectedPeriod)) return;
    const [year, month] = selectedPeriod.split('-').map(Number);
    const nextDate = new Date(year, month, 1);
    const now = new Date();
    if (nextDate <= now) {
      setSelectedPeriod(format(nextDate, 'yyyy-MM'));
    }
  };

  const isNextPeriodDisabled = useMemo(() => {
    if (isPeriodSummary(selectedPeriod)) return true;
    const [year, month] = selectedPeriod.split('-').map(Number);
    const nextDate = new Date(year, month, 1);
    const now = new Date();
    return nextDate > now;
  }, [selectedPeriod]);

  const isPrevPeriodDisabled = useMemo(() => {
    return isPeriodSummary(selectedPeriod);
  }, [selectedPeriod]);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [fetchedCustomers, fetchedUsers, fetchedTeams] = await Promise.all([
          getCustomers(),
          getUsers(),
          getTeams(),
        ]);
        setCustomers(fetchedCustomers);
        setUsers(fetchedUsers);
        setTeams(fetchedTeams);
      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const periodDates = useMemo(() => {
    const { type, year, month } = parsePeriod(selectedPeriod);
    let startDate: Date;
    let endDate: Date;

    switch (type) {
      case 'month':
        startDate = new Date(year, (month || 1) - 1, 1);
        endDate = endOfMonth(startDate);
        break;
      case 'H1':
        startDate = new Date(year, 0, 1);
        endDate = new Date(year, 5, 30);
        break;
      case 'H2':
        startDate = new Date(year, 6, 1);
        endDate = new Date(year, 11, 31);
        break;
      case 'year':
        startDate = new Date(year, 0, 1);
        endDate = new Date(year, 11, 31);
        break;
      default:
        startDate = startOfMonth(new Date());
        endDate = endOfMonth(new Date());
    }

    return { startDate, endDate };
  }, [selectedPeriod]);

  const contractScores = useMemo(() => {
    const { startDate, endDate } = periodDates;
    const scores: ContractScore[] = [];

    customers.forEach(customer => {
      let contractDate: string | undefined;
      let executionAmount: number = 0;

      if (customer.execution_date && customer.execution_amount) {
        contractDate = customer.execution_date;
        executionAmount = customer.execution_amount;
      } else if (customer.contract_completion_date) {
        contractDate = customer.contract_completion_date;
        executionAmount = 0;
      } else if (customer.status_code?.includes('계약완료')) {
        contractDate = customer.updated_at 
          ? (customer.updated_at instanceof Date ? customer.updated_at.toISOString().split('T')[0] : String(customer.updated_at).split('T')[0])
          : customer.entry_date;
        executionAmount = 0;
      }

      if (!contractDate) return;

      const cDate = new Date(contractDate);
      if (cDate < startDate || cDate > endDate) return;

      const processingOrg = customer.processing_org || '미등록';
      const { baseScore, categoryBonus, amountBonus, totalScore } = calculateContractScore(
        processingOrg,
        executionAmount
      );

      scores.push({
        customerId: customer.id,
        customerName: customer.name,
        companyName: customer.company_name,
        managerId: customer.manager_id,
        managerName: customer.manager_name || '',
        teamId: customer.team_id,
        teamName: customer.team_name || '',
        processingOrg,
        executionAmount: executionAmount,
        executionDate: contractDate,
        baseScore,
        categoryBonus,
        amountBonus,
        totalScore,
      });
    });

    return scores;
  }, [customers, periodDates]);

  const individualRankings = useMemo(() => {
    const managerMap = new Map<string, RankingEntry>();

    contractScores.forEach(score => {
      const existing = managerMap.get(score.managerId);
      if (existing) {
        existing.contractCount += 1;
        existing.totalScore += score.totalScore;
        existing.breakdown.baseScore += score.baseScore;
        existing.breakdown.categoryBonus += score.categoryBonus;
        existing.breakdown.amountBonus += score.amountBonus;
      } else {
        const userInfo = users.find(u => u.uid === score.managerId);
        managerMap.set(score.managerId, {
          id: score.managerId,
          name: userInfo?.name || score.managerName || '알 수 없음',
          teamName: userInfo?.team_name || score.teamName,
          contractCount: 1,
          totalScore: score.totalScore,
          breakdown: {
            baseScore: score.baseScore,
            categoryBonus: score.categoryBonus,
            amountBonus: score.amountBonus,
          },
        });
      }
    });

    return Array.from(managerMap.values())
      .sort((a, b) => b.totalScore - a.totalScore);
  }, [contractScores, users]);

  const teamRankings = useMemo(() => {
    const teamMap = new Map<string, RankingEntry>();

    contractScores.forEach(score => {
      if (!score.teamId) return;

      const existing = teamMap.get(score.teamId);
      if (existing) {
        existing.contractCount += 1;
        existing.totalScore += score.totalScore;
        existing.breakdown.baseScore += score.baseScore;
        existing.breakdown.categoryBonus += score.categoryBonus;
        existing.breakdown.amountBonus += score.amountBonus;
      } else {
        const teamInfo = teams.find(t => t.team_id === score.teamId);
        teamMap.set(score.teamId, {
          id: score.teamId,
          name: teamInfo?.team_name || score.teamName || '미배정',
          contractCount: 1,
          totalScore: score.totalScore,
          breakdown: {
            baseScore: score.baseScore,
            categoryBonus: score.categoryBonus,
            amountBonus: score.amountBonus,
          },
        });
      }
    });

    return Array.from(teamMap.values())
      .sort((a, b) => b.totalScore - a.totalScore);
  }, [contractScores, teams]);

  const renderRankingTable = (rankings: RankingEntry[]) => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-16 text-center">순위</TableHead>
          <TableHead>{activeTab === 'individual' ? '담당자' : '팀'}</TableHead>
          {activeTab === 'individual' && <TableHead>소속팀</TableHead>}
          <TableHead className="text-right pr-10">총점</TableHead>
          <TableHead className="pl-6" style={{ width: '312px', minWidth: '312px', maxWidth: '312px' }}>점수 분포</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rankings.length === 0 ? (
          <TableRow>
            <TableCell colSpan={activeTab === 'individual' ? 5 : 4} className="text-center py-8 text-muted-foreground">
              해당 기간 집행 데이터가 없습니다
            </TableCell>
          </TableRow>
        ) : (
          rankings.map((entry, index) => {
            const rank = index + 1;
            
            return (
              <TableRow 
                key={entry.id}
                className={rank <= 3 ? 'bg-muted/30' : ''}
              >
                <TableCell className="text-center">
                  <div className="flex items-center justify-center">
                    {getRankIcon(rank)}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{entry.name}</span>
                    {rank <= 3 && (
                      <Badge className={getRankBadgeColor(rank)}>
                        {rank === 1 ? '1위' : rank === 2 ? '2위' : '3위'}
                      </Badge>
                    )}
                  </div>
                </TableCell>
                {activeTab === 'individual' && (
                  <TableCell>
                    <span className="text-sm text-muted-foreground">
                      {entry.teamName || '-'}
                    </span>
                  </TableCell>
                )}
                <TableCell className="text-right pr-10">
                  <span className="font-bold text-lg">{entry.totalScore.toLocaleString()}</span>
                  <span className="text-muted-foreground text-sm ml-1">점</span>
                </TableCell>
                <TableCell className="pl-6" style={{ width: '312px', minWidth: '312px', maxWidth: '312px' }}>
                  <div className="space-y-1">
                    {entry.totalScore > 0 ? (
                      <div className="flex h-2.5 w-full rounded-full overflow-hidden">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div 
                              className="bg-blue-500 transition-all duration-300"
                              style={{ width: `${(entry.breakdown.baseScore / entry.totalScore) * 100}%` }}
                            />
                          </TooltipTrigger>
                          <TooltipContent side="top" className="text-xs">
                            <p className="font-medium">계약 점수</p>
                            <p>+{entry.breakdown.baseScore}점 ({Math.round((entry.breakdown.baseScore / entry.totalScore) * 100)}%)</p>
                          </TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div 
                              className="bg-purple-500 transition-all duration-300"
                              style={{ width: `${(entry.breakdown.categoryBonus / entry.totalScore) * 100}%` }}
                            />
                          </TooltipTrigger>
                          <TooltipContent side="top" className="text-xs">
                            <p className="font-medium">카테고리 가점</p>
                            <p>+{entry.breakdown.categoryBonus}점 ({Math.round((entry.breakdown.categoryBonus / entry.totalScore) * 100)}%)</p>
                          </TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div 
                              className="bg-emerald-500 transition-all duration-300"
                              style={{ width: `${(entry.breakdown.amountBonus / entry.totalScore) * 100}%` }}
                            />
                          </TooltipTrigger>
                          <TooltipContent side="top" className="text-xs">
                            <p className="font-medium">금액 가점</p>
                            <p>+{entry.breakdown.amountBonus}점 ({Math.round((entry.breakdown.amountBonus / entry.totalScore) * 100)}%)</p>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                    ) : (
                      <div className="h-2.5 w-full rounded-full bg-muted" />
                    )}
                    <div className="flex justify-between text-[10px] text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-blue-500" />
                        계약 +{entry.breakdown.baseScore}
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-purple-500" />
                        카테고리 +{entry.breakdown.categoryBonus}
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-emerald-500" />
                        금액 +{entry.breakdown.amountBonus}
                      </span>
                    </div>
                  </div>
                </TableCell>
              </TableRow>
            );
          })
        )}
      </TableBody>
    </Table>
  );

  const topThree = activeTab === 'individual' 
    ? individualRankings.slice(0, 3) 
    : teamRankings.slice(0, 3);

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
        <Skeleton className="h-[400px]" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-yellow-500/20 rounded-lg">
            <Trophy className="w-6 h-6 text-yellow-500" />
          </div>
          <div className="flex items-center gap-2">
            <div>
              <h1 className="text-2xl font-bold">매출 랭킹</h1>
              <p className="text-sm text-muted-foreground">{getPeriodLabel(selectedPeriod)} 실적 순위</p>
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-foreground">
                  <HelpCircle className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-sm p-4">
                <div className="space-y-3 text-xs">
                  <div>
                    <p className="font-semibold mb-1">계약 점수</p>
                    <p className="text-muted-foreground">계약 1건당 +20점</p>
                  </div>
                  <div>
                    <p className="font-semibold mb-1">카테고리 가점</p>
                    <div className="space-y-0.5 text-muted-foreground">
                      <p>+30점: 신보, 기보, 중진공, 농신보, 기업인증, 기타</p>
                      <p>+20점: 일시적, 상생</p>
                      <p>+10점: 재도전, 혁신, 미소금융</p>
                      <p>+0점: 신용취약, 지역재단</p>
                    </div>
                  </div>
                  <div>
                    <p className="font-semibold mb-1">집행금액 가점 (만원)</p>
                    <div className="space-y-0.5 text-muted-foreground">
                      <p>+40점: 15,000 이상</p>
                      <p>+30점: 10,000 ~ 15,000 미만</p>
                      <p>+20점: 5,000 ~ 10,000 미만</p>
                      <p>+10점: 1 ~ 5,000 미만</p>
                      <p>+0점: 금액 미입력</p>
                    </div>
                  </div>
                </div>
              </TooltipContent>
            </Tooltip>
          </div>
        </div>

        <div className="flex items-center bg-muted/50 rounded-lg border">
          <Button
            variant="ghost"
            size="icon"
            onClick={handlePrevPeriod}
            disabled={isPrevPeriodDisabled}
            className="rounded-l-lg rounded-r-none border-r"
            data-testid="button-prev-period"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <button
            className="px-6 py-2 min-w-[180px] text-center font-medium cursor-pointer select-none"
            onDoubleClick={() => setPeriodPickerOpen(true)}
            data-testid="text-selected-period"
          >
            {getPeriodLabel(selectedPeriod)} 랭킹
          </button>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleNextPeriod}
            disabled={isNextPeriodDisabled}
            className="rounded-r-lg rounded-l-none border-l"
            data-testid="button-next-period"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {topThree.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {topThree.map((entry, index) => {
            const rank = index + 1;
            const bgGradient = rank === 1 
              ? 'from-yellow-500/20 to-amber-500/10 border-yellow-500/30'
              : rank === 2 
                ? 'from-gray-400/20 to-gray-300/10 border-gray-400/30'
                : 'from-amber-600/20 to-orange-500/10 border-amber-600/30';

            return (
              <Card 
                key={entry.id} 
                className={`bg-gradient-to-br ${bgGradient} relative overflow-hidden`}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {getRankIcon(rank)}
                      <span className="text-lg font-bold">{rank}위</span>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div>
                      <p className="text-xl font-bold">{entry.name}</p>
                      {activeTab === 'individual' && entry.teamName && (
                        <p className="text-sm text-muted-foreground">{entry.teamName}</p>
                      )}
                    </div>
                    <div className="flex items-end gap-1">
                      <span className="text-3xl font-bold text-primary">
                        {entry.totalScore.toLocaleString()}
                      </span>
                      <span className="text-muted-foreground mb-1">점</span>
                    </div>
                    <div className="space-y-1">
                      {entry.totalScore > 0 ? (
                        <div className="flex h-2 w-full rounded-full overflow-hidden">
                          <div 
                            className="bg-blue-500"
                            style={{ width: `${(entry.breakdown.baseScore / entry.totalScore) * 100}%` }}
                          />
                          <div 
                            className="bg-purple-500"
                            style={{ width: `${(entry.breakdown.categoryBonus / entry.totalScore) * 100}%` }}
                          />
                          <div 
                            className="bg-emerald-500"
                            style={{ width: `${(entry.breakdown.amountBonus / entry.totalScore) * 100}%` }}
                          />
                        </div>
                      ) : (
                        <div className="h-2 w-full rounded-full bg-muted" />
                      )}
                      <div className="flex justify-between text-[10px] text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                          계약 +{entry.breakdown.baseScore}
                        </span>
                        <span className="flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                          카테고리 +{entry.breakdown.categoryBonus}
                        </span>
                        <span className="flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                          금액 +{entry.breakdown.amountBonus}
                        </span>
                      </div>
                    </div>
                  </div>
                </CardContent>
                {rank === 1 && (
                  <Star className="absolute -top-2 -right-2 w-16 h-16 text-yellow-500/10" />
                )}
              </Card>
            );
          })}
        </div>
      )}

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'individual' | 'team')}>
        <div className="relative">
          <div className="flex">
            <button
              onClick={() => setActiveTab('individual')}
              className={`flex items-center gap-2 px-5 py-2.5 text-sm font-medium rounded-t-lg transition-all duration-200 ${
                activeTab === 'individual'
                  ? 'bg-card text-primary font-bold border border-border border-b-0 relative z-10'
                  : 'bg-muted/50 text-muted-foreground hover:text-foreground hover:bg-muted/80 border border-transparent'
              }`}
              data-testid="tab-individual"
            >
              <User className="w-4 h-4" />
              개인 랭킹
            </button>
            <button
              onClick={() => setActiveTab('team')}
              className={`flex items-center gap-2 px-5 py-2.5 text-sm font-medium rounded-t-lg transition-all duration-200 ${
                activeTab === 'team'
                  ? 'bg-card text-primary font-bold border border-border border-b-0 relative z-10'
                  : 'bg-muted/50 text-muted-foreground hover:text-foreground hover:bg-muted/80 border border-transparent'
              }`}
              data-testid="tab-team"
            >
              <Users className="w-4 h-4" />
              팀 랭킹
            </button>
          </div>
          
          <Card className="rounded-tl-none border-t">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5" />
                {activeTab === 'individual' ? '전체 개인 순위' : '전체 팀 순위'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[500px]">
                <TabsContent value="individual" className="mt-0">
                  {renderRankingTable(individualRankings)}
                </TabsContent>
                <TabsContent value="team" className="mt-0">
                  {renderRankingTable(teamRankings)}
                </TabsContent>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      </Tabs>

      <Dialog open={periodPickerOpen} onOpenChange={setPeriodPickerOpen}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>기간 선택</DialogTitle>
            <DialogDescription>조회할 월 또는 기간을 선택하세요</DialogDescription>
          </DialogHeader>
          <ScrollArea className="h-[350px]">
            <div className="space-y-1 p-1">
              {monthOptions.map(option => {
                const isSummary = isPeriodSummary(option);
                const label = getPeriodLabel(option);
                return (
                  <button
                    key={option}
                    className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                      option === selectedPeriod 
                        ? 'bg-primary text-primary-foreground' 
                        : isSummary
                          ? 'bg-muted/50 font-semibold hover-elevate'
                          : 'hover-elevate'
                    } ${isSummary ? 'border-l-2 border-primary/50 ml-2' : ''}`}
                    onClick={() => {
                      setSelectedPeriod(option);
                      setPeriodPickerOpen(false);
                    }}
                    data-testid={`button-select-period-${option}`}
                  >
                    {label}
                    {isSummary && (
                      <Badge variant="outline" className="ml-2 text-[10px] py-0">
                        {option.endsWith('-H1') ? '1~6월' : option.endsWith('-H2') ? '7~12월' : '1~12월'}
                      </Badge>
                    )}
                  </button>
                );
              })}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}
