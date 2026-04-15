"use client";

import { Palette, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { useState, useEffect } from "react";
import { cn } from "@/shared/lib/utils";
import { useTheme } from "@/shared/providers/theme-provider";
import { palettePresets, PalettePreset } from "@/features/theme-editor/utils/theme-presets";

// Curated subset of themes for the picker (8 themes for variety without overwhelming)
const curatedThemes: PalettePreset[] = [
  palettePresets.find((t: PalettePreset) => t.id === "classic")!,
  palettePresets.find((t: PalettePreset) => t.id === "slate")!,
  palettePresets.find((t: PalettePreset) => t.id === "midnight")!,
  palettePresets.find((t: PalettePreset) => t.id === "forest")!,
  palettePresets.find((t: PalettePreset) => t.id === "ocean")!,
  palettePresets.find((t: PalettePreset) => t.id === "sunset")!,
  palettePresets.find((t: PalettePreset) => t.id === "berry")!,
  palettePresets.find((t: PalettePreset) => t.id === "monochrome")!,
].filter(Boolean);

// Color swatch component - shows brand primary and accent colors from swatches
function ColorSwatch({ primary, accent, isNoTheme }: { primary?: string; accent?: string; isNoTheme?: boolean }) {
  if (isNoTheme) {
    return (
      <div className="flex gap-1">
        <span className="block h-3 w-3 rounded-full border border-muted-foreground/30 bg-transparent" />
        <span className="block h-3 w-3 rounded-full border border-muted-foreground/30 bg-transparent" />
      </div>
    );
  }
  return (
    <div className="flex gap-1">
      <span
        className="block h-3 w-3 rounded-full"
        style={{ backgroundColor: primary }}
      />
      <span
        className="block h-3 w-3 rounded-full"
        style={{ backgroundColor: accent }}
      />
    </div>
  );
}

export function ThemePalettePicker() {
  const { colorTheme, setColorTheme, hasPaletteActive, clearColorTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleThemeSelect = (theme: PalettePreset) => {
    setColorTheme(theme.id);
  };

  const handleNoThemeSelect = () => {
    clearColorTheme();
  };

  const previewVariant = resolvedTheme === "dark" ? "dark" : "light";

  // Prevent hydration mismatch
  if (!mounted) {
    return (
      <Button variant="ghost" size="icon" aria-label="Choose color theme" title="Color theme">
        <Palette className="h-[1.2rem] w-[1.2rem]" />
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Choose color theme" title="Color theme">
          <Palette className="h-[1.2rem] w-[1.2rem]" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Color Theme</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {/* No theme option at the top */}
        <DropdownMenuItem
          onClick={handleNoThemeSelect}
          className={cn("flex items-center justify-between gap-2", !hasPaletteActive && "bg-accent")}
        >
          <span className="flex items-center gap-2">
            {!hasPaletteActive && <Check className="h-4 w-4" />}
            <span className={cn(!hasPaletteActive && "font-medium")}>No theme</span>
          </span>
          <ColorSwatch isNoTheme />
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {curatedThemes.map((theme) => {
          const isActive = colorTheme?.id === theme.id;

          return (
            <DropdownMenuItem
              key={theme.id}
              onClick={() => handleThemeSelect(theme)}
              className={cn("flex items-center justify-between gap-2", isActive && "bg-accent")}
            >
              <span className="flex items-center gap-2">
                {isActive && <Check className="h-4 w-4" />}
                <span className={cn(isActive && "font-medium")}>{theme.name}</span>
              </span>
              <ColorSwatch
                primary={theme.colors[previewVariant].primary}
                accent={theme.colors[previewVariant].accent}
              />
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
