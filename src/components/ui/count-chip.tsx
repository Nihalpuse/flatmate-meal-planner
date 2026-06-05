import { cn } from "@/lib/utils";

export function CountChip({ count }: { count: number }) {
  const positive = count > 0;
  return (
    <span
      className={cn(
        "flex h-[30px] min-w-[30px] items-center justify-center rounded-[10px] px-2 text-[15px] font-extrabold",
        positive ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
      )}
    >
      {count}
    </span>
  );
}
