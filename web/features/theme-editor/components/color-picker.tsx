'use client';

import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { hexToOklch } from '@/features/theme-editor/utils/theme-utils';
import { cn } from '@/shared/lib/utils';

interface ColorPickerProps {
  label: string;
  value: string; // OKLCH format: "oklch(L% C H)"
  onChange: (value: string) => void;
}

/**
 * Convert OKLCH to a hex color for the color input
 * This is an approximation since OKLCH->RGB conversion is complex
 */
function oklchToApproximateHex(oklch: string): string {
  // Parse OKLCH values
  const match = oklch.match(/oklch\((\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\)/);
  if (!match) return '#808080';
  
  const L = parseFloat(match[1]) / 100;
  const C = parseFloat(match[2]);
  const H = parseFloat(match[3]) * (Math.PI / 180); // Convert to radians
  
  // Simple OKLab to RGB approximation
  // Convert to OKLab a,b
  const a = C * Math.cos(H);
  const b = C * Math.sin(H);
  
  // Convert OKLab to linear RGB (simplified)
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b;
  
  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;
  
  const r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const b_ = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;
  
  // Gamma correct and clamp
  const gamma = (c: number) => {
    const linear = Math.max(0, Math.min(1, c));
    return linear <= 0.0031308 
      ? linear * 12.92 
      : 1.055 * Math.pow(linear, 1/2.4) - 0.055;
  };
  
  const toHex = (n: number) => 
    Math.round(Math.max(0, Math.min(255, n * 255))).toString(16).padStart(2, '0');
  
  return `#${toHex(gamma(r))}${toHex(gamma(g))}${toHex(gamma(b_))}`;
}

export function ColorPicker({ label, value, onChange }: ColorPickerProps) {
  // Parse current OKLCH value
  const [lightness, setLightness] = useState(50);
  const [chroma, setChroma] = useState(0.15);
  const [hue, setHue] = useState(250);
  const [hexInput, setHexInput] = useState('#808080');

  useEffect(() => {
    const match = value.match(/oklch\((\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\)/);
    if (match) {
      setLightness(parseFloat(match[1]));
      setChroma(parseFloat(match[2]));
      setHue(parseFloat(match[3]));
    }
    setHexInput(oklchToApproximateHex(value));
  }, [value]);

  const updateOklch = (newL: number, newC: number, newH: number) => {
    const oklch = `oklch(${newL.toFixed(1)}% ${newC.toFixed(3)} ${newH.toFixed(1)})`;
    onChange(oklch);
  };

  const handleHexChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const hex = e.target.value;
    setHexInput(hex);
    
    if (/^#[0-9A-Fa-f]{6}$/.test(hex)) {
      const oklch = hexToOklch(hex);
      onChange(oklch);
    }
  };

  return (
    <div className="space-y-3">
      <Label>{label}</Label>
      <div className="flex gap-3 items-start">
        {/* Color preview */}
        <div
          className="w-12 h-12 rounded-lg border shadow-sm shrink-0"
          style={{ backgroundColor: value }}
          aria-hidden="true"
        />
        
        <div className="flex-1 space-y-3">
          {/* Hex input */}
          <div className="flex gap-2 items-center">
            <Input
              type="color"
              value={hexInput}
              onChange={handleHexChange}
              className="w-10 h-10 p-1 cursor-pointer"
              aria-label={`${label} color picker`}
            />
            <Input
              value={hexInput}
              onChange={handleHexChange}
              placeholder="#000000"
              className="flex-1 h-10 text-sm font-mono"
            />
          </div>

          {/* OKLCH sliders */}
          <div className="space-y-2">
            {/* Lightness */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Lightness</span>
                <span className="font-mono">{lightness.toFixed(1)}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                step="0.5"
                value={lightness}
                onChange={(e) => {
                  const newL = parseFloat(e.target.value);
                  setLightness(newL);
                  updateOklch(newL, chroma, hue);
                }}
                className="w-full h-2 bg-gradient-to-r from-black to-white rounded-lg appearance-none cursor-pointer accent-accent"
                style={{ accentColor: value }}
              />
            </div>

            {/* Chroma (saturation) */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Chroma</span>
                <span className="font-mono">{chroma.toFixed(3)}</span>
              </div>
              <input
                type="range"
                min="0"
                max="0.4"
                step="0.001"
                value={chroma}
                onChange={(e) => {
                  const newC = parseFloat(e.target.value);
                  setChroma(newC);
                  updateOklch(lightness, newC, hue);
                }}
                className="w-full h-2 rounded-lg appearance-none cursor-pointer"
                style={{ 
                  background: `linear-gradient(to right, oklch(${lightness}% 0 ${hue}), oklch(${lightness}% 0.4 ${hue}))`,
                  accentColor: value
                }}
              />
            </div>

            {/* Hue */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Hue</span>
                <span className="font-mono">{hue.toFixed(0)}°</span>
              </div>
              <input
                type="range"
                min="0"
                max="360"
                step="1"
                value={hue}
                onChange={(e) => {
                  const newH = parseFloat(e.target.value);
                  setHue(newH);
                  updateOklch(lightness, chroma, newH);
                }}
                className="w-full h-2 rounded-lg appearance-none cursor-pointer"
                style={{
                  background: `linear-gradient(to right, 
                    oklch(${lightness}% ${chroma} 0),
                    oklch(${lightness}% ${chroma} 60),
                    oklch(${lightness}% ${chroma} 120),
                    oklch(${lightness}% ${chroma} 180),
                    oklch(${lightness}% ${chroma} 240),
                    oklch(${lightness}% ${chroma} 300),
                    oklch(${lightness}% ${chroma} 360)
                  )`,
                  accentColor: value
                }}
              />
            </div>
          </div>

          {/* OKLCH value display */}
          <div className="flex items-center gap-2">
            <Input
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder="oklch(65% 0.2 250)"
              className="h-9 text-xs font-mono"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
