"use client";

import { Suspense, useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { capture } from "@/lib/telemetry";

function PageviewTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    const query = searchParams.toString();
    capture("$pageview", { path: query ? `${pathname}?${query}` : pathname });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- searchParams est un objet recréé à chaque rendu ; sa version .toString() ci-dessus est la dépendance stable qu'on veut.
  }, [pathname, searchParams.toString()]);

  return null;
}

/** Monté une fois dans app/layout.tsx. `useSearchParams` exige un Suspense
 * au-dessus en rendu statique (même motif que login/signup). */
export function TelemetryProvider() {
  return (
    <Suspense>
      <PageviewTracker />
    </Suspense>
  );
}
