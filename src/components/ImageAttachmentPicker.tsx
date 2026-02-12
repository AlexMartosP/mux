import { useState } from "react";
import { Paperclip, X } from "lucide-react";
import { Button } from "./ui/button";
import { cn } from "@/lib/utils";
import type { ImageAttachment } from "@/types/agent";
import * as tauri from "@/domains/tauri/commands";
import { toast } from "sonner";

interface Props {
  attachments: ImageAttachment[];
  onAttachmentsChange: (attachments: ImageAttachment[]) => void;
  maxImages?: number;
  disabled?: boolean;
  className?: string;
}

export function ImageAttachmentPicker({
  attachments,
  onAttachmentsChange,
  maxImages = 5,
  disabled = false,
  className,
}: Props) {
  const [isSelecting, setIsSelecting] = useState(false);

  const handleSelectImages = async () => {
    if (disabled || isSelecting) return;

    // Check if we've reached max images
    if (attachments.length >= maxImages) {
      toast.warning(`You can only attach up to ${maxImages} images.`);
      return;
    }

    setIsSelecting(true);

    try {
      const selectedImages = await tauri.selectAndEncodeImages(5); // 5MB max per image

      if (selectedImages.length === 0) {
        // User cancelled
        setIsSelecting(false);
        return;
      }

      // Check if adding these would exceed max
      const remainingSlots = maxImages - attachments.length;
      if (selectedImages.length > remainingSlots) {
        toast.warning(`You can only add ${remainingSlots} more image${remainingSlots === 1 ? "" : "s"}.`);
        // Take only what fits
        const imagesToAdd = selectedImages.slice(0, remainingSlots);
        onAttachmentsChange([...attachments, ...imagesToAdd]);
      } else {
        onAttachmentsChange([...attachments, ...selectedImages]);
      }

      setIsSelecting(false);
    } catch (error) {
      setIsSelecting(false);
      console.error("Failed to select images:", error);
      toast.error(error instanceof Error ? error.message : "Failed to load images");
    }
  };

  const handleRemoveImage = (id: string) => {
    onAttachmentsChange(attachments.filter((img) => img.id !== id));
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  };

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {/* Attach button */}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={handleSelectImages}
        disabled={disabled || isSelecting || attachments.length >= maxImages}
        className="w-fit"
      >
        <Paperclip className="size-4 mr-2" />
        {isSelecting ? "Selecting..." : "Attach images"}
      </Button>

      {/* Image preview chips */}
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {attachments.map((image) => (
            <div
              key={image.id}
              className="group relative flex items-center gap-2 bg-card border border-border rounded-md p-2 pr-8 max-w-[240px]"
            >
              {/* Thumbnail */}
              <div className="flex-shrink-0 w-8 h-8 rounded overflow-hidden bg-muted border border-border">
                <img
                  src={image.preview || `data:${image.mediaType};base64,${image.data}`}
                  alt={image.name}
                  className="w-full h-full object-cover"
                />
              </div>

              {/* File info */}
              <div className="flex-1 min-w-0">
                <div className="text-xs text-foreground truncate">{image.name}</div>
                <div className="text-xs text-muted-foreground">{formatFileSize(image.sizeBytes)}</div>
              </div>

              {/* Remove button */}
              <button
                type="button"
                onClick={() => handleRemoveImage(image.id)}
                disabled={disabled}
                className="absolute right-1 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                aria-label="Remove image"
              >
                <X className="size-3 text-muted-foreground hover:text-foreground" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
