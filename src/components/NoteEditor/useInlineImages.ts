import { useCallback } from "react";
import { useNoteRepositoryContext } from "../../contexts/noteRepositoryContext";
import { compressImage } from "../../utils/imageCompression";

interface UseInlineImageUploadOptions {
  date: string;
  isEditable: boolean;
}

export function useInlineImageUpload({
  date,
  isEditable,
}: UseInlineImageUploadOptions) {
  const { imageRepository } = useNoteRepositoryContext();

  const uploadInlineImage = useCallback(
    async (
      file: File,
    ): Promise<{
      id: string;
      width: number;
      height: number;
      filename: string;
    }> => {
      if (!imageRepository) {
        throw new Error("Image repository not available");
      }

      const compressed = await compressImage(file);

      const result = await imageRepository.upload(
        date,
        compressed.blob,
        "inline",
        file.name,
        { width: compressed.width, height: compressed.height },
      );

      if (!result.ok) {
        throw new Error(result.error.message);
      }

      return {
        id: result.value.id,
        width: compressed.width,
        height: compressed.height,
        filename: file.name,
      };
    },
    [imageRepository, date],
  );

  return {
    onImageDrop: isEditable && imageRepository ? uploadInlineImage : undefined,
  };
}
