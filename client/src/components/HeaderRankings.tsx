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
  executionAmount: number
): { baseScore: number; categoryBonus: number; amountBonus: number; totalScore: number } => {
  const baseScore = 20;
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

    const executedCustomers = customers.filter(c => {
      let contractDate: string | undefined;
      
      if (c.execution_date && c.execution_amount) {
        contractDate = c.execution_date;
      } else if (c.contract_completion_date) {
        contractDate = c.contract_completion_date;
      } else if (c.status_code?.includes('계약완료')) {
        contractDate = c.updated_at 
          ? (c.updated_at instanceof Date ? c.updated_at.toISOString().split('T')[0] : String(c.updated_at).split('T')[0])
          : c.entry_date;
      }
      
      if (!contractDate) return false;
      const cDate = new Date(contractDate);
      return cDate >= startDate && cDate <= endDate;
    });

    const scoresByUser = new Map<string, { name: string; totalScore: number }>();
    
    executedCustomers.forEach(customer => {
      const managerId = customer.manager_id;
      if (!managerId) return;
      
      const user = userMap.get(managerId);
      if (!user) return;

      const processingOrg = customer.processing_org || '미등록';
      const executionAmount = customer.execution_amount || 0;
      const score = calculateContractScore(processingOrg, executionAmount);

      const existing = scoresByUser.get(managerId) || { name: user.name || user.email, totalScore: 0 };
      existing.totalScore += score.totalScore;
      scoresByUser.set(managerId, existing);
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
      <span className="text-xs text-muted-foreground mr-1 hidden sm:inline">이번달 TOP</span>
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
