import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Send } from 'lucide-react';
import { format } from 'date-fns';
import type { CustomerMemo } from '@shared/types';

// 안전한 날짜 포맷 헬퍼 (Firestore Timestamp 처리 + 에러 방지)
const safeFormatDate = (date: any, formatStr: string): string => {
  try {
    if (!date) return '';
    // Firestore Timestamp 처리
    if (date?.toDate && typeof date.toDate === 'function') {
      return format(date.toDate(), formatStr);
    }
    // Date 객체 처리
    if (date instanceof Date && !isNaN(date.getTime())) {
      return format(date, formatStr);
    }
    // 문자열/숫자 처리
    const parsed = new Date(date);
    if (!isNaN(parsed.getTime())) {
      return format(parsed, formatStr);
    }
    return '';
  } catch {
    return '';
  }
};

interface MemoModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerName: string;
  memoHistory: CustomerMemo[];
  onAddMemo: (content: string) => void;
}

export function MemoModal({
  open,
  onOpenChange,
  customerName,
  memoHistory,
  onAddMemo,
}: MemoModalProps) {
  const [newMemo, setNewMemo] = useState('');

  const handleSubmit = () => {
    if (!newMemo.trim()) return;
    onAddMemo(newMemo.trim());
    setNewMemo('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{customerName} - 메모</DialogTitle>
        </DialogHeader>
        
        <div className="flex flex-col h-[400px]">
          {/* Chat history area */}
          <ScrollArea className="flex-1 pr-4 mb-4">
            <div className="space-y-3">
              {memoHistory.length === 0 ? (
                <div className="text-center text-muted-foreground py-8">
                  메모 이력이 없습니다
                </div>
              ) : (
                [...memoHistory].reverse().map((memo, index) => (
                  <div
                    key={index}
                    className="bg-muted/50 rounded-lg p-3 space-y-1"
                    data-testid={`memo-entry-${index}`}
                  >
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{safeFormatDate(memo.created_at, 'yyyy-MM-dd HH:mm')}</span>
                      {memo.author_name && <span>- {memo.author_name}</span>}
                    </div>
                    <div className="text-sm whitespace-pre-wrap">
                      {memo.content}
                    </div>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>

          {/* Input area */}
          <div className="flex gap-2 pt-2 border-t">
            <Textarea
              placeholder="메모를 입력하세요..."
              value={newMemo}
              onChange={(e) => setNewMemo(e.target.value)}
              onKeyDown={handleKeyDown}
              className="resize-none min-h-[60px]"
              data-testid="input-new-memo"
            />
            <Button
              onClick={handleSubmit}
              disabled={!newMemo.trim()}
              size="icon"
              className="self-end"
              data-testid="button-submit-memo"
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
