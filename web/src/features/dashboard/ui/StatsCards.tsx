import { Bot, Clock, Heart, Activity } from "lucide-react";

interface StatsCardsProps {
  agentCount: number;
  cronCount: number;
  heartbeatCount: number;
  healthyCount: number;
}

export function StatsCards({
  agentCount,
  cronCount,
  heartbeatCount,
  healthyCount,
}: StatsCardsProps) {
  const cards = [
    { icon: Bot, label: "Agents", value: agentCount, color: "text-emerald-400" },
    { icon: Clock, label: "Cron Jobs", value: cronCount, color: "text-blue-400" },
    { icon: Heart, label: "Heartbeat", value: heartbeatCount, color: "text-rose-400" },
    { icon: Activity, label: "Healthy", value: healthyCount, color: "text-emerald-400" },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {cards.map(({ icon: Icon, label, value, color }) => (
        <div
          key={label}
          className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 transition-all duration-200 hover:border-white/[0.12] hover:bg-white/[0.04]"
        >
          <div className="flex items-center gap-2 mb-1">
            <Icon className={`h-3.5 w-3.5 ${color}`} />
            <span className="text-[10px] uppercase tracking-widest text-slate-500">{label}</span>
          </div>
          <p className="text-xl font-semibold text-slate-100">{value}</p>
        </div>
      ))}
    </div>
  );
}
