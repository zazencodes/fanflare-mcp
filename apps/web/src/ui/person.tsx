import type { Child } from "hono/jsx";

/** A reader's name and avatar: linked to their profile when public, plain when private. */
export function PersonLink({
  handle,
  private: unlisted,
  class: cls,
  children,
}: {
  handle: string;
  private: boolean | number;
  class?: string;
  children: Child;
}) {
  return unlisted ? (
    <span class={cls}>{children}</span>
  ) : (
    <a class={cls} href={"/u/" + encodeURIComponent(handle)}>
      {children}
    </a>
  );
}
