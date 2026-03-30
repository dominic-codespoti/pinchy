import { Search, X, ChevronUp, ChevronDown } from "lucide-react";
import { Input, Button } from "@/shared/ui/components/ui";

interface SearchPanelProps {
  query: string;
  setQuery: (value: string) => void;
  isOpen: boolean;
  onClose: () => void;
  onNext: () => void;
  onPrev: () => void;
  matchCount: number;
  currentMatch: number;
}

export function SearchPanel({
  query,
  setQuery,
  isOpen,
  onClose,
  onNext,
  onPrev,
  matchCount,
  currentMatch,
}: SearchPanelProps) {
  if (!isOpen) return null;
  
  return (
    <div className="absolute top-16 right-4 z-50 w-80 rounded-xl border border-white/[0.06] bg-slate-900/95 backdrop-blur-xl shadow-xl p-3">
      <div className="flex items-center gap-2">
        <Search className="h-4 w-4 text-slate-500" />
        <Input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search in conversation..."
          className="flex-1 border-0 bg-transparent focus:ring-0 text-sm"
        />
        <button
          type="button"
          onClick={onClose}
          className="text-slate-500 hover:text-slate-300"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      {query && (
        <div className="flex items-center justify-between mt-2">
          <span className="text-xs text-slate-500">
            {matchCount === 0 ? "No matches" : `${currentMatch + 1} of ${matchCount}`}
          </span>
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" className="!h-6 !w-6 !p-0" onClick={onPrev} disabled={matchCount === 0}>
              <ChevronUp className="h-3 w-3" />
            </Button>
            <Button variant="ghost" size="sm" className="!h-6 !w-6 !p-0" onClick={onNext} disabled={matchCount === 0}>
              <ChevronDown className="h-3 w-3" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
