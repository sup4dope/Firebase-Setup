import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useLocation } from 'wouter';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { HolidayManagement } from '@/components/HolidayManagement';
import { getHolidays, createHoliday, deleteHoliday } from '@/lib/firestore';
import type { Holiday } from '@shared/types';

export default function Holidays() {
  const { isSuperAdmin } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(true);
  const [formLoading, setFormLoading] = useState(false);

  // Redirect if not super admin
  useEffect(() => {
    if (!isSuperAdmin) {
      setLocation('/');
    }
  }, [isSuperAdmin, setLocation]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const fetchedHolidays = await getHolidays();
      setHolidays(fetchedHolidays);
    } catch (error) {
      console.error('Error fetching holidays:', error);
      toast({
        title: '오류',
        description: '공휴일을 불러오는 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isSuperAdmin) {
      fetchData();
    }
  }, [isSuperAdmin]);

  const handleAddHoliday = async (data: { date: string; description: string }) => {
    // Check if already exists
    if (holidays.some(h => h.date === data.date)) {
      toast({
        title: '중복',
        description: '이미 등록된 날짜입니다.',
        variant: 'destructive',
      });
      return;
    }

    setFormLoading(true);
    try {
      const newHoliday = await createHoliday(data);
      setHolidays(prev => [...prev, newHoliday]);
      toast({
        title: '성공',
        description: '공휴일이 등록되었습니다.',
      });
    } catch (error) {
      console.error('Error creating holiday:', error);
      toast({
        title: '오류',
        description: '공휴일 등록 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    } finally {
      setFormLoading(false);
    }
  };

  const handleDeleteHoliday = async (date: string) => {
    try {
      await deleteHoliday(date);
      setHolidays(prev => prev.filter(h => h.date !== date));
      toast({
        title: '성공',
        description: '공휴일이 삭제되었습니다.',
      });
    } catch (error) {
      console.error('Error deleting holiday:', error);
      toast({
        title: '오류',
        description: '공휴일 삭제 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    }
  };

  if (!isSuperAdmin) {
    return null;
  }

  if (loading) {
    return (
      <div className="p-6 space-y-6 max-w-3xl mx-auto">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">공휴일 관리</h1>
      <HolidayManagement
        holidays={holidays}
        onAdd={handleAddHoliday}
        onDelete={handleDeleteHoliday}
        isLoading={formLoading}
      />
    </div>
  );
}
