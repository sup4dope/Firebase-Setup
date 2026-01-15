/**
 * Optimized Document Viewer Component
 * - Skeleton UI loading animation
 * - PDF lazy loading with react-pdf
 * - In-memory caching
 * - Image optimization
 */

import { useState, useEffect, useCallback } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { Loader2, FileText, Download, ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fetchAndCache, isCached, getCachedDocument } from "@/lib/documentCache";
import { cn } from "@/lib/utils";

// PDF.js worker 설정
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface DocumentViewerProps {
  fileUrl: string;
  fileName: string;
  fileType: string;
  className?: string;
}

// Skeleton UI Component
function DocumentSkeleton({ type }: { type: "pdf" | "image" }) {
  return (
    <div className="w-full h-full flex items-center justify-center">
      <div className="relative w-full max-w-md">
        {/* Animated gradient background */}
        <div className="absolute inset-0 bg-gradient-to-r from-muted/30 via-muted/60 to-muted/30 animate-pulse rounded-lg" />
        
        {/* Content skeleton */}
        <div className="relative p-8 flex flex-col items-center gap-4">
          {/* Icon placeholder */}
          <div className="w-16 h-16 rounded-lg bg-muted/50 animate-pulse flex items-center justify-center">
            <FileText className="w-8 h-8 text-muted-foreground/50" />
          </div>
          
          {/* Loading text */}
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">
              {type === "pdf" ? "PDF 로딩 중..." : "이미지 로딩 중..."}
            </span>
          </div>
          
          {/* Progress bars */}
          <div className="w-full space-y-2">
            <div className="h-2 bg-muted/50 rounded animate-pulse" style={{ width: "100%" }} />
            <div className="h-2 bg-muted/50 rounded animate-pulse" style={{ width: "80%" }} />
            <div className="h-2 bg-muted/50 rounded animate-pulse" style={{ width: "60%" }} />
          </div>
        </div>
      </div>
    </div>
  );
}

// PDF Viewer with lazy loading
function PDFViewer({ url, fileName }: { url: string; fileName: string }) {
  const [numPages, setNumPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [scale, setScale] = useState<number>(1);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [cachedUrl, setCachedUrl] = useState<string | null>(null);

  // 문서 변경 시 상태 리셋
  useEffect(() => {
    setCurrentPage(1);
    setScale(1);
    setNumPages(0);
    setError(null);
  }, [url]);

  // 캐시된 URL 가져오기
  useEffect(() => {
    let isMounted = true;
    
    async function loadPdf() {
      setIsLoading(true);
      setError(null);
      
      try {
        // 캐시 확인
        if (isCached(url)) {
          const cached = getCachedDocument(url);
          if (cached && isMounted) {
            setCachedUrl(cached.objectUrl);
            return;
          }
        }

        // 네트워크에서 가져오고 캐시
        const objectUrl = await fetchAndCache(url, fileName, "application/pdf");
        if (isMounted) {
          setCachedUrl(objectUrl);
        }
      } catch (err) {
        if (isMounted) {
          setError("PDF를 불러올 수 없습니다");
          setCachedUrl(url); // Fallback to original URL
        }
      }
    }

    loadPdf();
    return () => { isMounted = false; };
  }, [url, fileName]);

  const onDocumentLoadSuccess = useCallback(({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    setIsLoading(false);
  }, []);

  const onDocumentLoadError = useCallback((err: Error) => {
    console.error("PDF load error:", err);
    setError("PDF를 불러올 수 없습니다");
    setIsLoading(false);
  }, []);

  const goToPrevPage = () => setCurrentPage((p) => Math.max(1, p - 1));
  const goToNextPage = () => setCurrentPage((p) => Math.min(numPages, p + 1));
  const zoomIn = () => setScale((s) => Math.min(2, s + 0.25));
  const zoomOut = () => setScale((s) => Math.max(0.5, s - 0.25));

  if (error) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground">
        <FileText className="w-16 h-16 mb-4 text-muted-foreground/50" />
        <p className="mb-4">{error}</p>
        <a href={url} download={fileName} target="_blank" rel="noopener noreferrer">
          <Button variant="outline" size="sm">
            <Download className="w-4 h-4 mr-2" />
            다운로드
          </Button>
        </a>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col">
      {/* PDF Content */}
      <div className="flex-1 overflow-auto flex items-start justify-center p-4 bg-muted/20">
        {isLoading && <DocumentSkeleton type="pdf" />}
        
        {cachedUrl && (
          <Document
            file={cachedUrl}
            onLoadSuccess={onDocumentLoadSuccess}
            onLoadError={onDocumentLoadError}
            loading={<DocumentSkeleton type="pdf" />}
            className={cn(isLoading && "hidden")}
          >
            <Page
              pageNumber={currentPage}
              scale={scale}
              loading={<DocumentSkeleton type="pdf" />}
              renderTextLayer={false}
              renderAnnotationLayer={false}
              className="shadow-lg"
            />
          </Document>
        )}
      </div>

      {/* Controls - 하단에 위치, 세로 여백 축소 */}
      <div className="shrink-0 flex items-center justify-center gap-2 py-1 px-2 bg-muted/30 border-t">
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={goToPrevPage} 
          disabled={currentPage <= 1}
          data-testid="button-pdf-prev"
        >
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <span className="text-sm text-muted-foreground min-w-[80px] text-center">
          {currentPage} / {numPages || "-"}
        </span>
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={goToNextPage} 
          disabled={currentPage >= numPages}
          data-testid="button-pdf-next"
        >
          <ChevronRight className="w-4 h-4" />
        </Button>
        <div className="w-px h-4 bg-border mx-2" />
        <Button variant="ghost" size="icon" onClick={zoomOut} disabled={scale <= 0.5}>
          <ZoomOut className="w-4 h-4" />
        </Button>
        <span className="text-xs text-muted-foreground min-w-[40px] text-center">
          {Math.round(scale * 100)}%
        </span>
        <Button variant="ghost" size="icon" onClick={zoomIn} disabled={scale >= 2}>
          <ZoomIn className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

// Image Viewer with caching
function ImageViewer({ url, fileName, fileType }: { url: string; fileName: string; fileType: string }) {
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<boolean>(false);
  const [displayUrl, setDisplayUrl] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    
    async function loadImage() {
      setIsLoading(true);
      setError(false);
      
      try {
        // 캐시 확인 및 로드
        if (isCached(url)) {
          const cached = getCachedDocument(url);
          if (cached && isMounted) {
            setDisplayUrl(cached.objectUrl);
            setIsLoading(false);
            return;
          }
        }

        // 네트워크에서 가져오고 캐시
        const objectUrl = await fetchAndCache(url, fileName, fileType);
        if (isMounted) {
          setDisplayUrl(objectUrl);
        }
      } catch (err) {
        if (isMounted) {
          setDisplayUrl(url); // Fallback
        }
      }
    }

    loadImage();
    return () => { isMounted = false; };
  }, [url, fileName, fileType]);

  return (
    <div className="w-full h-full flex items-center justify-center relative">
      {isLoading && <DocumentSkeleton type="image" />}
      
      {displayUrl && (
        <img
          src={displayUrl}
          alt={fileName}
          className={cn(
            "max-w-full max-h-full object-contain rounded transition-opacity duration-300",
            isLoading ? "opacity-0" : "opacity-100"
          )}
          onLoad={() => setIsLoading(false)}
          onError={() => {
            setError(true);
            setIsLoading(false);
          }}
        />
      )}
      
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted/50">
          <div className="text-center text-muted-foreground">
            <FileText className="w-12 h-12 mx-auto mb-2" />
            <p>이미지를 불러올 수 없습니다</p>
          </div>
        </div>
      )}
    </div>
  );
}

// Main Document Viewer Component
export function DocumentViewer({ fileUrl, fileName, fileType, className }: DocumentViewerProps) {
  const isPdf = fileType === "application/pdf" || fileType.includes("pdf");
  const isImage = fileType.startsWith("image/");

  if (isPdf) {
    return (
      <div className={cn("w-full h-full", className)}>
        <PDFViewer url={fileUrl} fileName={fileName} />
      </div>
    );
  }

  if (isImage) {
    return (
      <div className={cn("w-full h-full", className)}>
        <ImageViewer url={fileUrl} fileName={fileName} fileType={fileType} />
      </div>
    );
  }

  // Unsupported file type
  return (
    <div className={cn("w-full h-full flex items-center justify-center", className)}>
      <div className="text-muted-foreground text-center">
        <FileText className="w-16 h-16 mx-auto mb-4 text-muted-foreground/50" />
        <p className="mb-4">미리보기를 지원하지 않는 파일 형식입니다</p>
        <a href={fileUrl} download={fileName} target="_blank" rel="noopener noreferrer">
          <Button variant="outline" size="sm">
            <Download className="w-4 h-4 mr-2" />
            다운로드
          </Button>
        </a>
      </div>
    </div>
  );
}

export default DocumentViewer;
