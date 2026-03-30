import { useCallback, useRef, useState } from "react";

export function usePendingImages() {
  const [pendingImages, setPendingImages] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const addImages = useCallback((files: FileList | File[]) => {
    const MAX_SIZE = 10 * 1024 * 1024;
    Array.from(files).forEach((file) => {
      if (!file.type.startsWith("image/")) return;
      if (file.size > MAX_SIZE) return;
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") {
          setPendingImages((prev) => [...prev, reader.result as string]);
        }
      };
      reader.readAsDataURL(file);
    });
  }, []);

  return { pendingImages, setPendingImages, addImages, fileInputRef } as const;
}
