import Link from "next/link";
import { ChevronLeftIcon } from "lucide-react";
import { iconMap, type NavigationIcon } from "@/lib/navigation";
import { Card } from "@/components/ui/card";

export function LinkCard({
  href,
  icon,
  label,
}: {
  href: string;
  icon: NavigationIcon;
  label: string;
}) {
  const Icon = iconMap[icon];
  return (
    <Link href={href} className="group block">
      <Card className="flex items-center justify-between p-4 transition-colors hover:bg-muted/50">
        <div className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon className="size-5" aria-hidden />
          </span>
          <span className="text-sm font-medium">{label}</span>
        </div>
        <ChevronLeftIcon
          className="size-4 text-muted-foreground transition-transform rtl:rotate-180 group-hover:text-foreground"
          aria-hidden
        />
      </Card>
    </Link>
  );
}
