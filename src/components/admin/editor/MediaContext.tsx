"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";

import type { MediaUploadPreset } from "@/lib/media-crop";
import type { MediaDto } from "@/server/media/service";

import { MediaPicker } from "./MediaPicker";

// Images known to the editor (id → src/size/alt) and the picker dialog.
// The article body stores only media ids; node views look the picture up here.

interface PickOptions {
  title?: string;
  multiple?: boolean;
  preset?: MediaUploadPreset;
}

interface MediaContextValue {
  media: Record<string, MediaDto>;
  remember: (items: MediaDto[]) => void;
  pick: (options?: PickOptions) => Promise<MediaDto[] | null>;
}

const MediaContext = createContext<MediaContextValue | null>(null);

export function MediaProvider({ initial, children }: { initial: Record<string, MediaDto>; children: React.ReactNode }) {
  const [media, setMedia] = useState(initial);
  const [request, setRequest] = useState<PickOptions | null>(null);
  const resolver = useRef<((value: MediaDto[] | null) => void) | null>(null);

  const remember = useCallback((items: MediaDto[]) => {
    setMedia((current) => ({ ...current, ...Object.fromEntries(items.map((m) => [m.id, m])) }));
  }, []);

  const pick = useCallback((options: PickOptions = {}) => {
    resolver.current?.(null);
    setRequest(options);
    return new Promise<MediaDto[] | null>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const finish = useCallback(
    (chosen: MediaDto[] | null) => {
      if (chosen?.length) remember(chosen);
      resolver.current?.(chosen && chosen.length ? chosen : null);
      resolver.current = null;
      setRequest(null);
    },
    [remember],
  );

  const value = useMemo(() => ({ media, remember, pick }), [media, remember, pick]);

  return (
    <MediaContext.Provider value={value}>
      {children}
      {request && <MediaPicker title={request.title} multiple={Boolean(request.multiple)} preset={request.preset} onDone={finish} />}
    </MediaContext.Provider>
  );
}

export function useMedia(): MediaContextValue {
  const value = useContext(MediaContext);
  if (!value) throw new Error("useMedia() outside <MediaProvider>");
  return value;
}
