import type { NoteImage } from "../types";
import type { Result } from "../domain/result";
import type { RepositoryError } from "../domain/errors";

/**
 * Repository interface for managing note images
 * Supports both local (encrypted IndexedDB) and cloud (Supabase Storage) implementations
 */
export interface ImageRepository {
  /**
   * Upload an image and return metadata
   * @param noteDate - The date of the note this image belongs to (DD-MM-YYYY)
   * @param file - The image blob to upload
   * @param type - Whether this is a background or inline image
   * @param filename - Original filename
   * @param options - Optional metadata hints (dimensions are used for layout placeholders)
   * @returns Result with metadata for the uploaded image, or error
   */
  upload(
    noteDate: string,
    file: Blob,
    type: "background" | "inline",
    filename: string,
    options?: { width?: number; height?: number },
  ): Promise<Result<NoteImage, RepositoryError>>;

  /**
   * Get image blob by ID
   * @param imageId - UUID of the image
   * @returns Result with image blob or null if not found, or error
   */
  get(imageId: string): Promise<Result<Blob | null, RepositoryError>>;

  /**
   * Get a remote URL for rendering the image if supported
   * Returns signed URL for cloud-backed repositories, otherwise null
   * @param imageId - UUID of the image
   * @returns Result with URL string or null if not found, or error
   */
  getUrl(imageId: string): Promise<Result<string | null, RepositoryError>>;

  /**
   * Delete an image by ID
   * @param imageId - UUID of the image
   * @returns Result with void on success, or error
   */
  delete(imageId: string): Promise<Result<void, RepositoryError>>;

  /**
   * Get all images for a specific note
   * @param noteDate - The date of the note (DD-MM-YYYY)
   * @returns Result with array of image metadata, or error
   */
  getByNoteDate(noteDate: string): Promise<Result<NoteImage[], RepositoryError>>;

  /**
   * Delete all images associated with a note
   * Used for cleanup when a note is deleted
   * @param noteDate - The date of the note (DD-MM-YYYY)
   * @returns Result with void on success, or error
   */
  deleteByNoteDate(noteDate: string): Promise<Result<void, RepositoryError>>;
}
