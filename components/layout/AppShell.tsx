import { ReactNode } from "react";
import {
  Home,
  BookOpen,
  PenTool,
  FileText,
  CheckSquare,
  BarChart,
  Calendar,
  Settings,
} from "lucide-react";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-page-mint p-12 md:p-16 flex justify-center">
      <div className="w-full max-w-[1380px] bg-app-surface rounded-[30px] shadow-overlay flex overflow-hidden">
        <SidebarRail />
        {children}
      </div>
    </div>
  );
}

function SidebarRail() {
  return (
    <aside className="w-[76px] shrink-0 bg-panel-surface flex flex-col items-center py-6 gap-6 rounded-l-[30px] border-r border-line">
      {/* Logo Placeholder */}
      <div className="w-10 h-10 rounded-full bg-ink flex items-center justify-center text-app-surface font-bold text-xl mb-4">
        G
      </div>

      <nav className="flex flex-col gap-4">
        <RailItem icon={<Home size={20} />} active />
        <RailItem icon={<BookOpen size={20} />} />
        <RailItem icon={<PenTool size={20} />} />
        <RailItem icon={<FileText size={20} />} />
        <RailItem icon={<CheckSquare size={20} />} />
        <RailItem icon={<BarChart size={20} />} />
        <RailItem icon={<Calendar size={20} />} />
      </nav>

      <div className="mt-auto flex flex-col gap-4 items-center">
        <RailItem icon={<Settings size={20} />} />
        <div className="w-8 h-8 rounded-full bg-slate mt-2 border-2 border-app-surface" />
      </div>
    </aside>
  );
}

function RailItem({ icon, active }: { icon: ReactNode; active?: boolean }) {
  return (
    <button
      className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${
        active
          ? "bg-ink text-app-surface"
          : "text-ink-muted hover:text-ink hover:bg-control"
      }`}
    >
      {icon}
    </button>
  );
}
