import { Suspense } from "react";

import { LibraryBrowser } from "@/components/library/library-browser";

/** The Library - the one org-wide artifact registry (design
 *  `handoff/athena-artifacts-library-design.md`). Suspense boundary because the
 *  browser reads URL-backed filter/selection state via `useSearchParams`. */
export default function LibraryPage() {
  return (
    <Suspense fallback={<div className="skeleton mx-auto my-6 h-[60vh] w-full max-w-screen-lg rounded-xl" />}>
      <LibraryBrowser />
    </Suspense>
  );
}
