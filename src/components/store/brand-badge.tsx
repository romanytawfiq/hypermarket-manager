import { cn } from "@/lib/utils";

/**
 * Displays a product's brand name with its logo (data-URI) when present,
 * falling back to a text-initials tile. Used on the storefront product card and
 * product details. If there is no brand, renders nothing.
 */
export function BrandBadge({
  name,
  logo,
  className,
}: {
  name: string;
  logo?: string;
  className?: string;
}) {
  if (!name) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border bg-muted/40 px-2 py-0.5",
        className,
      )}
    >
      {logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logo}
          alt={`شعار ${name}`}
          className="size-4 shrink-0 rounded-sm object-contain"
          loading="lazy"
        />
      ) : (
        <span
          aria-hidden
          className="flex size-4 shrink-0 items-center justify-center rounded-sm bg-muted text-[10px] font-bold text-muted-foreground"
        >
          {name.trim().charAt(0)}
        </span>
      )}
      <span className="text-xs font-medium text-muted-foreground">{name}</span>
    </span>
  );
}