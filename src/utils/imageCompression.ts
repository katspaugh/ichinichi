/**
 * Image compression and resizing utility
 * Reduces file size for images larger than the specified limit
 */

export interface CompressedImage {
  blob: Blob;
  width: number;
  height: number;
  mimeType: string;
}

const DEFAULT_MAX_SIZE = 2 * 1024 * 1024; // 2MB
const JPEG_QUALITY = 0.8; // 80% quality for JPEG compression
const MAX_DIMENSION = 3000; // Max width/height to prevent huge images

/**
 * Compresses an image file if it exceeds the max size
 * Uses canvas API to resize and compress
 * @param file - The image file to compress
 * @param maxSizeBytes - Maximum file size in bytes (default 2MB)
 * @returns Compressed image with metadata
 */
export async function compressImage(
  file: File,
  maxSizeBytes: number = DEFAULT_MAX_SIZE,
): Promise<CompressedImage> {
  // If file is already small enough, return as-is
  if (file.size <= maxSizeBytes) {
    const dimensions = await getImageDimensions(file);
    return {
      blob: file,
      width: dimensions.width,
      height: dimensions.height,
      mimeType: file.type,
    };
  }

  // Load image
  const img = await loadImage(file);

  // Calculate target dimensions
  let { width, height } = calculateTargetDimensions(
    img.width,
    img.height,
    MAX_DIMENSION,
  );

  // Determine output format (JPEG for photos, PNG for transparency)
  const hasAlpha = await imageHasTransparency(file);
  const outputMimeType = hasAlpha ? "image/png" : "image/jpeg";
  const quality = outputMimeType === "image/jpeg" ? JPEG_QUALITY : 1;

  // Compress with multiple passes if needed
  let compressed = await compressToCanvas(
    img,
    width,
    height,
    outputMimeType,
    quality,
  );

  // If still too large, reduce dimensions further
  while (compressed.size > maxSizeBytes && width > 100 && height > 100) {
    width = Math.floor(width * 0.8);
    height = Math.floor(height * 0.8);
    compressed = await compressToCanvas(
      img,
      width,
      height,
      outputMimeType,
      quality,
    );
  }

  return {
    blob: compressed,
    width,
    height,
    mimeType: outputMimeType,
  };
}

/**
 * Load an image file into an HTMLImageElement
 */
function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load image"));
    };

    img.src = url;
  });
}

/**
 * Get dimensions of an image file without loading into canvas
 */
function getImageDimensions(
  file: File,
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.width, height: img.height });
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to get image dimensions"));
    };

    img.src = url;
  });
}

/**
 * Check if an image has transparency (alpha channel)
 */
async function imageHasTransparency(file: File): Promise<boolean> {
  // PNG and WebP can have transparency, JPEG cannot
  if (file.type === "image/png" || file.type === "image/webp") {
    // For PNG/WebP, actually check the pixels
    try {
      const img = await loadImage(file);
      const canvas = document.createElement("canvas");
      canvas.width = Math.min(img.width, 100); // Sample area only
      canvas.height = Math.min(img.height, 100);
      const ctx = canvas.getContext("2d");

      if (!ctx) return false;

      ctx.drawImage(img as unknown as CanvasImageSource, 0, 0, canvas.width, canvas.height);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;

      // Check if any pixel has alpha < 255
      for (let i = 3; i < data.length; i += 4) {
        if (data[i] < 255) {
          return true;
        }
      }
    } catch {
      // If we can't check, assume no transparency
      return false;
    }
  }

  return false;
}

/**
 * Calculate target dimensions maintaining aspect ratio
 */
function calculateTargetDimensions(
  width: number,
  height: number,
  maxDimension: number,
): { width: number; height: number } {
  if (width <= maxDimension && height <= maxDimension) {
    return { width, height };
  }

  const aspectRatio = width / height;

  if (width > height) {
    return {
      width: maxDimension,
      height: Math.round(maxDimension / aspectRatio),
    };
  } else {
    return {
      width: Math.round(maxDimension * aspectRatio),
      height: maxDimension,
    };
  }
}

/**
 * Compress image using canvas
 */
function compressToCanvas(
  img: HTMLImageElement,
  width: number,
  height: number,
  mimeType: string,
  quality: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      reject(new Error("Failed to get canvas context"));
      return;
    }

    // Use better image smoothing for quality
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    // Draw image at target size
    ctx.drawImage(img as unknown as CanvasImageSource, 0, 0, width, height);

    // Convert to blob
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error("Failed to create blob from canvas"));
        }
      },
      mimeType,
      quality,
    );
  });
}
