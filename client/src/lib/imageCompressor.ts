/**
 * Image Compression Utility
 * 브라우저에서 이미지 파일을 80% 품질로 압축
 */

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const COMPRESSION_QUALITY = 0.8; // 80% quality
const MAX_DIMENSION = 2048; // 최대 이미지 크기 (가로/세로)

export interface CompressionResult {
  file: File;
  originalSize: number;
  compressedSize: number;
  wasCompressed: boolean;
}

/**
 * 이미지 파일 압축
 * - JPEG/PNG 이미지를 80% 품질로 압축
 * - 비이미지 파일은 그대로 반환
 */
export async function compressImage(file: File): Promise<CompressionResult> {
  const originalSize = file.size;

  // 이미지가 아닌 경우 그대로 반환
  if (!file.type.startsWith('image/')) {
    return {
      file,
      originalSize,
      compressedSize: originalSize,
      wasCompressed: false,
    };
  }

  // 파일 크기가 작으면 압축 스킵 (500KB 이하)
  if (file.size <= 500 * 1024) {
    return {
      file,
      originalSize,
      compressedSize: originalSize,
      wasCompressed: false,
    };
  }

  try {
    const compressedFile = await compressImageFile(file);
    return {
      file: compressedFile,
      originalSize,
      compressedSize: compressedFile.size,
      wasCompressed: true,
    };
  } catch (error) {
    console.warn('Image compression failed, using original:', error);
    return {
      file,
      originalSize,
      compressedSize: originalSize,
      wasCompressed: false,
    };
  }
}

/**
 * Canvas API를 사용하여 이미지 압축
 */
async function compressImageFile(file: File): Promise<File> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (event) => {
      const img = new Image();
      
      img.onload = () => {
        try {
          // 크기 계산 (비율 유지하면서 최대 크기 제한)
          let width = img.width;
          let height = img.height;
          
          if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
            if (width > height) {
              height = (height / width) * MAX_DIMENSION;
              width = MAX_DIMENSION;
            } else {
              width = (width / height) * MAX_DIMENSION;
              height = MAX_DIMENSION;
            }
          }

          // Canvas 생성 및 그리기
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Canvas context not available'));
            return;
          }

          // 이미지 그리기
          ctx.drawImage(img, 0, 0, width, height);

          // Blob으로 변환 (JPEG 80% 품질)
          canvas.toBlob(
            (blob) => {
              if (!blob) {
                reject(new Error('Canvas to Blob conversion failed'));
                return;
              }

              // 새 파일 생성 (원본 파일명 유지, 확장자는 jpg로)
              const extension = file.type === 'image/png' ? 'png' : 'jpg';
              const fileName = file.name.replace(/\.[^.]+$/, `.${extension}`);
              const compressedFile = new File([blob], fileName, {
                type: file.type === 'image/png' ? 'image/png' : 'image/jpeg',
                lastModified: Date.now(),
              });

              resolve(compressedFile);
            },
            file.type === 'image/png' ? 'image/png' : 'image/jpeg',
            COMPRESSION_QUALITY
          );
        } catch (error) {
          reject(error);
        }
      };

      img.onerror = () => reject(new Error('Image load failed'));
      img.src = event.target?.result as string;
    };

    reader.onerror = () => reject(new Error('FileReader failed'));
    reader.readAsDataURL(file);
  });
}

/**
 * 파일 크기 검증
 */
export function validateFileSize(file: File): { valid: boolean; message?: string } {
  if (file.size > MAX_FILE_SIZE) {
    return {
      valid: false,
      message: `파일 크기가 너무 큽니다. (최대 ${MAX_FILE_SIZE / 1024 / 1024}MB)`,
    };
  }
  return { valid: true };
}

/**
 * 파일 크기를 읽기 쉬운 형식으로 변환
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
