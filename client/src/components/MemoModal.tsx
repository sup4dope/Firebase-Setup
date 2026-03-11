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
import { Send, Trash2 } from 'lucide-react';
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
  onDeleteMemo?: (index: number) => void;
  isSuperAdmin?: boolean;
  currentUserId?: string;
}

export function MemoModal({
  open,
  onOpenChange,
  customerName,
  memoHistory,
  onAddMemo,
  onDeleteMemo,
  isSuperAdmin,
  currentUserId,
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
                [...memoHistory].reverse().map((memo, index) => {
                  const originalIndex = memoHistory.length - 1 - index;
                  return (
                    <div
                      key={index}
                      className="bg-muted/50 rounded-lg p-3 space-y-1 group"
                      data-testid={`memo-entry-${index}`}
                    >
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{safeFormatDate(memo.created_at, 'yyyy-MM-dd HH:mm')}</span>
                        {memo.author_name && <span>- {memo.author_name}</span>}
                        {!memo.is_deleted && onDeleteMemo && (isSuperAdmin || currentUserId === memo.author_id) && (
                          <button
                            onClick={() => onDeleteMemo(originalIndex)}
                            className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-red-500 ml-auto"
                            data-testid={`button-delete-memo-${index}`}
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                      {memo.is_deleted ? (
                        isSuperAdmin ? (
                          <div>
                            <div className="text-sm whitespace-pre-wrap text-muted-foreground line-through">
                              {memo.content}
                            </div>
                            <p className="text-xs text-red-400 mt-1">
                              삭제: {memo.deleted_by_name} ({safeFormatDate(memo.deleted_at, 'yyyy-MM-dd HH:mm')})
                            </p>
                          </div>
                        ) : (
                          <div className="text-sm text-muted-foreground italic">
                            [삭제된 메세지 입니다.]
                          </div>
                        )
                      ) : (
                        <div className="text-sm whitespace-pre-wrap">
                          {memo.content}
                        </div>
                      )}
                    </div>
                  );
                })
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
