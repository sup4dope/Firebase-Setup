/**
 * Document Cache Service
 * 브라우저 메모리에 파일을 캐싱하여 재열람 시 즉시 표시
 */

interface CachedDocument {
  blob: Blob;
  objectUrl: string;
  cachedAt: number;
  fileType: string;
  fileName: string;
}

// 캐시 저장소
const documentCache = new Map<string, CachedDocument>();

// 캐시 설정
const MAX_CACHE_SIZE = 50; // 최대 캐시 항목 수
const CACHE_TTL = 30 * 60 * 1000; // 30분 캐시 유효 시간

/**
 * URL에서 파일을 가져와 캐시에 저장
 */
export async function fetchAndCache(
  url: string,
  fileName: string,
  fileType: string
): Promise<string> {
  // 1. 캐시 확인
  const cached = documentCache.get(url);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL) {
    return cached.objectUrl;
  }

  // 2. 네트워크에서 가져오기
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch: ${response.status}`);
    }

    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);

    // 3. 캐시에 저장
    addToCache(url, {
      blob,
      objectUrl,
      cachedAt: Date.now(),
      fileType,
      fileName,
    });

    return objectUrl;
  } catch (error) {
    console.warn('Document fetch failed, using original URL:', error);
    return url;
  }
}

/**
 * 캐시에 항목 추가 (LRU 기반 관리)
 */
function addToCache(key: string, doc: CachedDocument): void {
  // 기존 항목이 있으면 Object URL 해제 후 교체
  const existing = documentCache.get(key);
  if (existing) {
    URL.revokeObjectURL(existing.objectUrl);
  }

  // 캐시 크기 초과 시 오래된 항목 제거
  if (documentCache.size >= MAX_CACHE_SIZE && !existing) {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    documentCache.forEach((value, cacheKey) => {
      if (value.cachedAt < oldestTime) {
        oldestTime = value.cachedAt;
        oldestKey = cacheKey;
      }
    });

    if (oldestKey) {
      removeFromCache(oldestKey);
    }
  }

  documentCache.set(key, doc);
}

/**
 * 캐시에서 항목 제거 (Object URL 해제 포함)
 */
function removeFromCache(key: string): void {
  const cached = documentCache.get(key);
  if (cached) {
    URL.revokeObjectURL(cached.objectUrl);
    documentCache.delete(key);
  }
}

/**
 * 캐시에서 문서 가져오기 (존재하면 즉시 반환)
 */
export function getCachedDocument(url: string): CachedDocument | null {
  const cached = documentCache.get(url);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL) {
    return cached;
  }
  return null;
}

/**
 * 캐시 여부 확인
 */
export function isCached(url: string): boolean {
  const cached = documentCache.get(url);
  return !!cached && Date.now() - cached.cachedAt < CACHE_TTL;
}

/**
 * 전체 캐시 클리어
 */
export function clearDocumentCache(): void {
  documentCache.forEach((doc) => {
    URL.revokeObjectURL(doc.objectUrl);
  });
  documentCache.clear();
}

/**
 * 만료된 캐시 항목 정리
 */
export function cleanExpiredCache(): void {
  const now = Date.now();
  const keysToRemove: string[] = [];

  documentCache.forEach((value, key) => {
    if (now - value.cachedAt >= CACHE_TTL) {
      keysToRemove.push(key);
    }
  });

  keysToRemove.forEach(removeFromCache);
}

/**
 * 캐시 통계 정보
 */
export function getCacheStats(): { size: number; maxSize: number } {
  return {
    size: documentCache.size,
    maxSize: MAX_CACHE_SIZE,
  };
}
