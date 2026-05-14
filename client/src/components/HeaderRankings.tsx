import { useState, useEffect, useMemo } from 'react';
import { format } from 'date-fns';
import { Crown, Medal, Award } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Skeleton } from '@/components/ui/skeleton';
import { getCustomers, getUsers, getTeams } from '@/lib/firestore';
import { useAuth } from '@/contexts/AuthContext';
import type { Customer, User, Team } from '@shared/types';

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
  executionAmount: number,
  contractAmount: number = 0,
  statusCode: string = '',
  isExecuted: boolean = false
): { baseScore: number; categoryBonus: number; amountBonus: number; totalScore: number } => {
  let baseScore = 0;
  
  if (statusCode === '계약완료(선불)') {
    baseScore = 10;
  } else if (statusCode === '계약완료(후불)') {
    baseScore = 5;
  } else if (statusCode === '계약완료(외주)') {
    baseScore = 5;
  } else if (statusCode === '집행완료(후불)') {
    baseScore = 0;
  } else if (statusCode === '집행완료(외주)') {
    baseScore = 0;
  } else if (statusCode === '집행완료(선불)') {
    baseScore = 0;
  } else if (statusCode === '집행완료') {
    baseScore = 10;
  }
  
  const categoryBonus = isExecuted ? (CATEGORY_BONUS[processingOrg] ?? 0) : 0;
  const amountBonus = isExecuted ? getAmountBonus(executionAmount) : 0;
  const totalScore = baseScore + categoryBonus + amountBonus;
  return { baseScore, categoryBonus, amountBonus, totalScore };
};

interface RankingEntry {
  id: string;
  name: string;
  totalScore: number;
}

export function HeaderRankings() {
  const { user } = useAuth();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  const currentMonth = useMemo(() => format(new Date(), 'yyyy-MM'), []);

  useEffect(() => {
    if (!user) return;
    const fetchData = async () => {
      try {
        // 헤더 랭킹은 전사 리더보드 — 모든 사용자가 서로의 실적을 보므로 전체 고객 조회
        const [fetchedCustomers, fetchedUsers] = await Promise.all([
          getCustomers(),
          getUsers(),
        ]);
        setCustomers(fetchedCustomers);
        setUsers(fetchedUsers);
      } catch (error) {
        console.error('Error fetching ranking data:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [user?.uid, user?.role, user?.team_id]);

  const top3Rankings = useMemo(() => {
    const userMap = new Map(users.map(u => [u.uid, u]));
    
    const startDate = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const endDate = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0);

    const isPrepaidStatus = (status: string) => 
      status === '계약완료(선불)' || 
      status === '서류취합완료(선불)' || 
      status === '신청완료(선불)' ||
      status === '집행완료(선불)';
    
    const isPostpaidStatus = (status: string) =>
      status === '계약완료(후불)' ||
      status === '서류취합완료(후불)' ||
      status === '신청완료(후불)' ||
      status === '집행완료(후불)';
    
    const isOutsourceStatus = (status: string) =>
      status === '계약완료(외주)' ||
      status === '서류취합완료(외주)' ||
      status === '신청완료(외주)' ||
      status === '집행완료(외주)';
    
    const getDateFallback = (c: Customer): string | undefined => {
      if (c.updated_at instanceof Date) return c.updated_at.toISOString().split('T')[0];
      if (c.updated_at) return String(c.updated_at).split('T')[0];
      return c.entry_date;
    };

    const scoresByUser = new Map<string, { name: string; totalScore: number }>();

    const addScore = (customer: Customer, sDate: string, effStatus: string, isExec: boolean) => {
      const d = new Date(sDate);
      if (d < startDate || d > endDate) return;

      const managerId = customer.manager_id;
      if (!managerId) return;
      const user = userMap.get(managerId);
      if (!user) return;

      const contractAmount = customer.contract_amount || customer.deposit_amount || 0;
      const approvedOrgs = (customer.processing_orgs || []).filter(o => o.status === '승인');

      if (approvedOrgs.length > 0) {
        let isFirstOrg = true;
        for (const org of approvedOrgs) {
          const orgName = org.org || '미등록';
          const orgExecAmt = isExec ? (org.execution_amount || customer.execution_amount || 0) : 0;
          const orgContractAmt = isFirstOrg ? contractAmount : 0;
          const score = calculateContractScore(orgName, orgExecAmt, orgContractAmt, effStatus, isExec);
          const existing = scoresByUser.get(managerId) || { name: user.name || user.email, totalScore: 0 };
          existing.totalScore += score.totalScore;
          scoresByUser.set(managerId, existing);
          isFirstOrg = false;
        }
      } else {
        const processingOrg = customer.processing_org || '미등록';
        const executionAmount = isExec ? (customer.execution_amount || 0) : 0;
        const score = calculateContractScore(processingOrg, executionAmount, contractAmount, effStatus, isExec);
        const existing = scoresByUser.get(managerId) || { name: user.name || user.email, totalScore: 0 };
        existing.totalScore += score.totalScore;
        scoresByUser.set(managerId, existing);
      }
    };

    const handleExecSplit = (customer: Customer, baseStatus: string, execStatus: string) => {
      const dpd = (customer as any).deposit_paid_date as string | undefined;
      const contractDate = dpd || customer.contract_completion_date || getDateFallback(customer);
      const execDate = customer.execution_date;
      const cMonth = contractDate?.slice(0, 7);
      const eMonth = execDate?.slice(0, 7);

      if (contractDate && execDate && cMonth !== eMonth) {
        addScore(customer, contractDate, baseStatus, false);
        addScore(customer, execDate, execStatus, true);
      } else {
        const date = contractDate || execDate;
        if (date) addScore(customer, date, baseStatus, true);
      }
    };

    customers.forEach(customer => {
      const statusCode = customer.status_code || '';
      const depositPaidDate = (customer as any).deposit_paid_date as string | undefined;

      if (statusCode === '집행완료') {
        handleExecSplit(customer, '계약완료(선불)', '집행완료(선불)');
        return;
      }

      if (isPrepaidStatus(statusCode)) {
        if (statusCode === '집행완료(선불)') {
          handleExecSplit(customer, '계약완료(선불)', '집행완료(선불)');
          return;
        }
        const scoreDate = depositPaidDate || customer.contract_completion_date || getDateFallback(customer);
        if (scoreDate) addScore(customer, scoreDate, '계약완료(선불)', false);
        return;
      }

      if (isPostpaidStatus(statusCode)) {
        if (statusCode === '집행완료(후불)') {
          handleExecSplit(customer, '계약완료(후불)', '집행완료(후불)');
          return;
        }
        const scoreDate = depositPaidDate || customer.contract_completion_date || getDateFallback(customer);
        if (scoreDate) addScore(customer, scoreDate, '계약완료(후불)', false);
        return;
      }

      if (isOutsourceStatus(statusCode)) {
        if (statusCode === '집행완료(외주)') {
          handleExecSplit(customer, '계약완료(외주)', '집행완료(외주)');
          return;
        }
        const scoreDate = depositPaidDate || customer.contract_completion_date || getDateFallback(customer);
        if (scoreDate) addScore(customer, scoreDate, '계약완료(외주)', false);
        return;
      }

      if (statusCode === '민원처리') {
        const scoreDate = depositPaidDate || customer.contract_completion_date || customer.execution_date || getDateFallback(customer);
        const isExec = !!(customer.execution_amount && customer.execution_date);
        if (scoreDate) addScore(customer, scoreDate, '계약완료(선불)', isExec);
        return;
      }
    });

    const rankings: RankingEntry[] = Array.from(scoresByUser.entries())
      .map(([id, data]) => ({ id, name: data.name, totalScore: data.totalScore }))
      .sort((a, b) => b.totalScore - a.totalScore)
      .slice(0, 3);

    return rankings;
  }, [customers, users]);

  if (loading) {
    return (
      <div className="flex items-center gap-2">
        <Skeleton className="h-6 w-20" />
        <Skeleton className="h-6 w-20" />
        <Skeleton className="h-6 w-20" />
      </div>
    );
  }

  if (top3Rankings.length === 0) {
    return null;
  }

  const getRankIcon = (rank: number) => {
    switch (rank) {
      case 1:
        return <Crown className="w-3.5 h-3.5 text-yellow-500" />;
      case 2:
        return <Medal className="w-3.5 h-3.5 text-gray-400" />;
      case 3:
        return <Award className="w-3.5 h-3.5 text-amber-600" />;
      default:
        return null;
    }
  };

  const getRankStyle = (rank: number) => {
    switch (rank) {
      case 1:
        return 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/30';
      case 2:
        return 'bg-gray-400/10 text-gray-600 dark:text-gray-300 border-gray-400/30';
      case 3:
        return 'bg-amber-600/10 text-amber-700 dark:text-amber-400 border-amber-600/30';
      default:
        return '';
    }
  };

  return (
    <div className="flex items-center gap-1.5">
      {top3Rankings.map((entry, index) => {
        const rank = index + 1;
        return (
          <Tooltip key={entry.id}>
            <TooltipTrigger asChild>
              <div
                className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium border ${getRankStyle(rank)} cursor-default`}
                data-testid={`header-rank-${rank}`}
              >
                {getRankIcon(rank)}
                <span className="max-w-[60px] truncate">{entry.name}</span>
                <span className="opacity-70">{entry.totalScore}점</span>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p>{rank}위: {entry.name}</p>
              <p className="text-muted-foreground">{entry.totalScore.toLocaleString()}점</p>
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}
