interface StatCardProps {
  title: string;
  value: string | number;
  icon: any;
  description?: string;
  accent?: string;
}

export function StatCard({ title, value, icon: Icon, description, accent = "bg-blue-500/15 text-blue-400" }: StatCardProps) {

  return (
    <div className="min-w-0 rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4 backdrop-blur transition-colors hover:border-zinc-700 sm:p-5">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${accent} sm:h-11 sm:w-11`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
      <p className="mt-3 truncate text-2xl font-bold text-white sm:mt-4 sm:text-3xl">{value}</p>
      <p className="mt-1 break-words text-xs leading-5 text-zinc-400 sm:text-sm">{title}</p>
      {description && <p className="mt-1 break-words text-xs text-zinc-500">{description}</p>}
    </div>
  );
}
