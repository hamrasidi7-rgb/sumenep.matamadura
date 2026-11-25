"use client";

import { Crosshair } from "lucide-react";
import { useRef } from "react";

import { clampFocal, FEATURED_IMAGE_LABEL } from "@/lib/media-crop";

export interface FocalPointPickerProps {
  src: string;
  alt?: string;
  focalX: number;
  focalY: number;
  onChange: (focal: { focalX: number; focalY: number }) => void;
  disabled?: boolean;
  /** Optional natural pixel dimensions displayed below the crop frame. */
  naturalSize?: { width: number; height: number } | null;
}

const QUICK_PRESETS: readonly { label: string; focalX: number; focalY: number }[] = [
  { label: "Tengah", focalX: 50, focalY: 50 },
  { label: "Atas", focalX: 50, focalY: 20 },
  { label: "Bawah", focalX: 50, focalY: 80 },
  { label: "Kiri", focalX: 20, focalY: 50 },
  { label: "Kanan", focalX: 80, focalY: 50 },
];

/**
 * Interactive 16:10 (1200 × 750) preview + focal-point crop picker.
 * Works with mouse click/drag, touch pointer drag, and keyboard preset buttons.
 */
export function FocalPointPicker({
  src,
  alt = "Pratinjau crop 16:10",
  focalX,
  focalY,
  onChange,
  disabled = false,
  naturalSize,
}: FocalPointPickerProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  function updateFromPointer(clientX: number, clientY: number) {
    if (disabled || !frameRef.current) return;
    const rect = frameRef.current.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const x = clampFocal(((clientX - rect.left) / rect.width) * 100);
    const y = clampFocal(((clientY - rect.top) / rect.height) * 100);
    onChange({ focalX: x, focalY: y });
  }

  return (
    <div className="space-y-2">
      <div
        ref={frameRef}
        data-testid="focal-point-frame"
        onPointerDown={(e) => {
          if (disabled) return;
          dragging.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          updateFromPointer(e.clientX, e.clientY);
        }}
        onPointerMove={(e) => {
          if (!dragging.current) return;
          updateFromPointer(e.clientX, e.clientY);
        }}
        onPointerUp={() => {
          dragging.current = false;
        }}
        onPointerCancel={() => {
          dragging.current = false;
        }}
        className={`relative aspect-[16/10] w-full select-none overflow-hidden rounded-md border border-line bg-warm ${
          disabled ? "opacity-60" : "cursor-crosshair"
        }`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          draggable={false}
          style={{ objectPosition: `${focalX}% ${focalY}%` }}
          className="h-full w-full object-cover"
        />

        {/* Subtle rule-of-thirds crop guide */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3 opacity-35"
        >
          <span className="border-r border-b border-white/80" />
          <span className="border-r border-b border-white/80" />
          <span className="border-b border-white/80" />
          <span className="border-r border-b border-white/80" />
          <span className="border-r border-b border-white/80" />
          <span className="border-b border-white/80" />
          <span className="border-r border-white/80" />
          <span className="border-r border-white/80" />
          <span />
        </div>

        {/* Focal point marker */}
        <div
          aria-hidden="true"
          style={{ left: `${focalX}%`, top: `${focalY}%` }}
          className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2"
        >
          <span className="flex size-7 items-center justify-center rounded-full border-2 border-white bg-brand/85 text-white shadow-md">
            <Crosshair className="size-3.5" />
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
        <span>
          Titik fokus: <strong className="font-semibold text-ink tabular-nums">{focalX}% × {focalY}%</strong>
          {naturalSize ? ` · Asli ${naturalSize.width} × ${naturalSize.height} px` : ""}
          {" · "}Target {FEATURED_IMAGE_LABEL}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Posisi fokus cepat">
        {QUICK_PRESETS.map((preset) => {
          const active = focalX === preset.focalX && focalY === preset.focalY;
          return (
            <button
              key={preset.label}
              type="button"
              disabled={disabled}
              onClick={() => onChange({ focalX: preset.focalX, focalY: preset.focalY })}
              aria-pressed={active}
              className={`rounded border px-2 py-1 text-xs font-medium transition-colors ${
                active
                  ? "border-brand bg-blush text-brand-deep"
                  : "border-line bg-paper text-ink hover:border-ink/40 hover:bg-warm"
              }`}
            >
              {preset.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
