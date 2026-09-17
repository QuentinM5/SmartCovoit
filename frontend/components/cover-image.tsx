"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { getCoverImage, type AccessMode } from "@/lib/api";

interface CoverImageProps {
  eventId: string;
  accessMode: AccessMode;
  revision: number;
  className: string;
}

export function CoverImage(props: CoverImageProps) {
  const { user, loading } = useAuth();
  const [attempt, setAttempt] = useState(0);
  if (loading) return <div className={props.className} aria-label="Chargement de l’image" />;
  // Remount before painting when identity/access/content changes: a previous
  // user's blob must never remain visible while the new request is pending.
  return <CoverImageContent
    key={JSON.stringify([props.eventId, props.accessMode, props.revision, user?.id, attempt])}
    eventId={props.eventId}
    className={props.className}
    onRetry={() => setAttempt((current) => current + 1)}
  />;
}

function CoverImageContent({ eventId, className, onRetry }: {
  eventId: string;
  className: string;
  onRetry: () => void;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    let objectUrl: string | undefined;
    getCoverImage(eventId, controller.signal).then((blob) => {
      if (controller.signal.aborted) return;
      objectUrl = URL.createObjectURL(blob);
      setSrc(objectUrl);
    }).catch(() => {
      if (!controller.signal.aborted) setFailed(true);
    });
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [eventId]);

  if (failed) return <div className={`${className} flex flex-col items-center justify-center gap-2 p-2 text-center text-xs`}>
    <span role="alert">L’image n’a pas pu être chargée.</span>
    <button type="button" onClick={onRetry} className="relative z-10 cursor-pointer underline">Réessayer</button>
  </div>;
  if (!src) return <div className={`${className} animate-pulse bg-line/30`} aria-label="Chargement de l’image" />;
  // eslint-disable-next-line @next/next/no-img-element -- authenticated blob, unavailable to the image optimizer.
  return <img src={src} alt="" className={className} onError={() => setFailed(true)} />;
}
