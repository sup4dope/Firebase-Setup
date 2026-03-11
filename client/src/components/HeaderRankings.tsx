import { useState, useEffect, useMemo } from 'react';
import { format } from 'date-fns';
import { Crown, Medal, Award } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Skeleton } from '@/components/ui/skeleton';
import { getCustomers, getUsers, getTeams } from '@/lib/firestore';
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
  statusCode: string = ''
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
  
  const categoryBonus = CATEGORY_BONUS[processingOrg] ?? 0;
  const amountBonus = getAmountBonus(executionAmount);
  const totalScore = baseScore + categoryBonus + amountBonus;
  return { baseScore, categoryBonus, amountBonus, totalScore };
};

interface RankingEntry {
  id: string;
  name: string;
  totalScore: number;
}

export function HeaderRankings() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  const currentMonth = useMemo(() => format(new Date(), 'yyyy-MM'), []);

  useEffect(() => {
    const fetchData = async () => {
      try {
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
  }, []);

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

    customers.forEach(customer => {
      const statusCode = customer.status_code || '';
      let scoreDate: string | undefined;
      let effectiveStatus: string = statusCode;
      let isExecuted = false;

      if (statusCode === '집행완료') {
        scoreDate = customer.execution_date || customer.contract_completion_date || getDateFallback(customer);
        isExecuted = true;
      }
      else if (isPrepaidStatus(statusCode)) {
        scoreDate = customer.contract_completion_date || getDateFallback(customer);
        isExecuted = statusCode === '집행완료(선불)';
        effectiveStatus = '계약완료(선불)';
      }
      else if (isPostpaidStatus(statusCode)) {
        if (statusCode === '집행완료(후불)') {
          scoreDate = customer.execution_date || customer.contract_completion_date || getDateFallback(customer);
          isExecuted = true;
        } else {
          scoreDate = customer.contract_completion_date || getDateFallback(customer);
          isExecuted = false;
        }
        effectiveStatus = '계약완료(후불)';
      }
      else if (isOutsourceStatus(statusCode)) {
        if (statusCode === '집행완료(외주)') {
          scoreDate = customer.execution_date || customer.contract_completion_date || getDateFallback(customer);
          isExecuted = true;
        } else {
          scoreDate = customer.contract_completion_date || getDateFallback(customer);
          isExecuted = false;
        }
        effectiveStatus = '계약완료(외주)';
      }

      if (!scoreDate) return;
      const sDate = new Date(scoreDate);
      if (sDate < startDate || sDate > endDate) return;

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
          const orgExecutionAmount = isExecuted ? (org.execution_amount || customer.execution_amount || 0) : 0;
          const orgContractAmount = isFirstOrg ? contractAmount : 0;
          const score = calculateContractScore(orgName, orgExecutionAmount, orgContractAmount, effectiveStatus);
          const existing = scoresByUser.get(managerId) || { name: user.name || user.email, totalScore: 0 };
          existing.totalScore += score.totalScore;
          scoresByUser.set(managerId, existing);
          isFirstOrg = false;
        }
      } else {
        const processingOrg = customer.processing_org || '미등록';
        const executionAmount = isExecuted ? (customer.execution_amount || 0) : 0;
        const score = calculateContractScore(processingOrg, executionAmount, contractAmount, effectiveStatus);
        const existing = scoresByUser.get(managerId) || { name: user.name || user.email, totalScore: 0 };
        existing.totalScore += score.totalScore;
        scoresByUser.set(managerId, existing);
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
