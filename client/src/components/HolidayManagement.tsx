import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isWeekend } from 'date-fns';
import { ko } from 'date-fns/locale';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { ChevronLeft, ChevronRight, Plus, X, Loader2 } from 'lucide-react';
import type { Holiday } from '@shared/types';

const holidaySchema = z.object({
  date: z.string().min(1, '날짜를 선택해주세요'),
  description: z.string().min(1, '설명을 입력해주세요'),
});

type HolidayFormData = z.infer<typeof holidaySchema>;

interface HolidayManagementProps {
  holidays: Holiday[];
  onAdd: (data: HolidayFormData) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  isLoading?: boolean;
}

export function HolidayManagement({
  holidays,
  onAdd,
  onDelete,
  isLoading,
}: HolidayManagementProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const form = useForm<HolidayFormData>({
    resolver: zodResolver(holidaySchema),
    defaultValues: {
      date: '',
      description: '',
    },
  });

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });

  // Pad to start on Sunday
  const startDay = monthStart.getDay();
  const paddingDays = Array(startDay).fill(null);

  const isHoliday = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return holidays.some(h => h.date === dateStr);
  };

  const getHolidayInfo = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return holidays.find(h => h.date === dateStr);
  };

  const handlePrevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  const handleDayClick = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    const holiday = getHolidayInfo(date);
    
    if (holiday) {
      // If already a holiday, remove it
      onDelete(holiday.date);
    } else if (!isWeekend(date)) {
      // If not a weekend, open dialog to add holiday
      setSelectedDate(dateStr);
      form.setValue('date', dateStr);
      setDialogOpen(true);
    }
  };

  const handleSubmit = async (data: HolidayFormData) => {
    await onAdd(data);
    setDialogOpen(false);
    form.reset();
    setSelectedDate(null);
  };

  const handleOpenAddDialog = () => {
    form.reset({
      date: format(new Date(), 'yyyy-MM-dd'),
      description: '',
    });
    setDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
          <CardTitle className="text-lg">공휴일 관리</CardTitle>
          <Button size="sm" onClick={handleOpenAddDialog} data-testid="button-add-holiday">
            <Plus className="w-4 h-4 mr-2" />
            공휴일 추가
          </Button>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Calendar navigation */}
            <div className="flex items-center justify-between">
              <Button variant="ghost" size="icon" onClick={handlePrevMonth}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <h3 className="text-lg font-semibold">
                {format(currentDate, 'yyyy년 M월', { locale: ko })}
              </h3>
              <Button variant="ghost" size="icon" onClick={handleNextMonth}>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>

            {/* Calendar grid */}
            <div className="grid grid-cols-7 gap-1">
              {/* Weekday headers */}
              {['일', '월', '화', '수', '목', '금', '토'].map((day, i) => (
                <div 
                  key={day} 
                  className={cn(
                    "text-center text-sm font-medium py-2",
                    i === 0 && "text-destructive",
                    i === 6 && "text-blue-500"
                  )}
                >
                  {day}
                </div>
              ))}

              {/* Padding days */}
              {paddingDays.map((_, i) => (
                <div key={`pad-${i}`} className="aspect-square" />
              ))}

              {/* Days */}
              {daysInMonth.map(date => {
                const dateStr = format(date, 'yyyy-MM-dd');
                const holiday = getHolidayInfo(date);
                const weekend = isWeekend(date);
                const dayOfWeek = date.getDay();

                return (
                  <button
                    key={dateStr}
                    onClick={() => handleDayClick(date)}
                    disabled={weekend}
                    className={cn(
                      "aspect-square flex flex-col items-center justify-center rounded-md text-sm relative transition-colors",
                      weekend && "bg-muted/50 text-muted-foreground cursor-not-allowed",
                      dayOfWeek === 0 && "text-destructive",
                      dayOfWeek === 6 && "text-blue-500",
                      holiday && "bg-destructive/10 text-destructive",
                      !weekend && !holiday && "hover:bg-accent cursor-pointer"
                    )}
                    data-testid={`day-${dateStr}`}
                  >
                    <span>{date.getDate()}</span>
                    {holiday && (
                      <span className="absolute -top-1 -right-1">
                        <Badge variant="destructive" className="text-[8px] px-1 py-0">
                          휴
                        </Badge>
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Holiday list */}
            <div className="mt-6 pt-6 border-t">
              <h4 className="text-sm font-semibold mb-3">등록된 공휴일</h4>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {holidays
                  .filter(h => {
                    const hDate = new Date(h.date);
                    return isSameMonth(hDate, currentDate);
                  })
                  .sort((a, b) => a.date.localeCompare(b.date))
                  .map(holiday => (
                    <div
                      key={holiday.id}
                      className="flex items-center justify-between p-2 bg-muted/50 rounded-md"
                      data-testid={`holiday-${holiday.date}`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-medium tabular-nums">
                          {format(new Date(holiday.date), 'M/d (EEE)', { locale: ko })}
                        </span>
                        <span className="text-sm text-muted-foreground">
                          {holiday.description}
                        </span>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => onDelete(holiday.date)}
                        data-testid={`button-delete-holiday-${holiday.date}`}
                      >
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  ))}
                {holidays.filter(h => isSameMonth(new Date(h.date), currentDate)).length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    이 달에 등록된 공휴일이 없습니다
                  </p>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Add Holiday Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>공휴일 추가</DialogTitle>
          </DialogHeader>
          
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>날짜 *</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} data-testid="input-holiday-date" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>설명 *</FormLabel>
                    <FormControl>
                      <Input placeholder="크리스마스" {...field} data-testid="input-holiday-description" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => setDialogOpen(false)}
                >
                  취소
                </Button>
                <Button type="submit" disabled={isLoading} data-testid="button-submit-holiday">
                  {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  추가
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
