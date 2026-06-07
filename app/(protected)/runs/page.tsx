import { redirect } from "next/navigation";

/**
 * The old run/phase flow is gone — tasks live on the recursive-Task spine at
 * `/work`. This redirect keeps stray `/runs` links (bookmarks, old emails)
 * landing on the new board instead of a 404.
 */
export default function RunsRedirect() {
  redirect("/work");
}
