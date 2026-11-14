"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Crop, Maximize } from "lucide-react";
import type { CropBox, DocImage } from "@/lib/documents/extract";

interface Props {
  images: DocImage[];
  initialImageId?: number;
  initialBox?: CropBox;
  onCancel: () => void;
  onApply: (imageId: number, box: CropBox) => void;
}

const FULL: CropBox = { x: 0, y: 0, w: 1, h: 1 };

/**
 * Lets the admin pick a page/picture from the uploaded documents and drag a
 * rectangle over the part that should become the question's image.
 */
export function SnapshotPicker({
  images,
  initialImageId,
  initialBox,
  onCancel,
  onApply,
}: Props) {
  const [index, setIndex] = useState(() =>
    Math.max(0, images.findIndex((i) => i.id === initialImageId))
  );
  const [box, setBox] = useState<CropBox | null>(initialBox ?? null);
  const frameRef = useRef<HTMLDivElement>(null);
  const dragStart = useRef<{ x: number; y: number } | null>(null);

  const image = images[index];

  function go(next: number) {
    setIndex(Math.min(images.length - 1, Math.max(0, next)));
    setBox(null);
  }

  function pointAt(e: React.PointerEvent) {
    const rect = frameRef.current!.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)),
    };
  }

  function onPointerDown(e: React.PointerEvent) {
    e.preventDefault();
    frameRef.current?.setPointerCapture(e.pointerId);
    const p = pointAt(e);
    dragStart.current = p;
    setBox({ x: p.x, y: p.y, w: 0, h: 0 });
  }

  function dragTo(e: React.PointerEvent) {
    const start = dragStart.current;
    if (!start) return null;
    const p = pointAt(e);
    return {
      x: Math.min(start.x, p.x),
      y: Math.min(start.y, p.y),
      w: Math.abs(p.x - start.x),
      h: Math.abs(p.y - start.y),
    };
  }

  function onPointerMove(e: React.PointerEvent) {
    const next = dragTo(e);
    if (next) setBox(next);
  }

  function onPointerUp(e: React.PointerEvent) {
    const final = dragTo(e);
    dragStart.current = null;
    if (!final) return;
    // A click without a real drag clears the selection.
    setBox(final.w > 0.015 && final.h > 0.015 ? final : null);
  }

  if (!image) return null;

  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            className="h-8 w-8 p-0"
            disabled={index === 0}
            onClick={() => go(index - 1)}
            title="Previous"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <select
            className="h-8 min-w-0 max-w-xs truncate rounded-md border border-input bg-background px-2 text-xs"
            value={index}
            onChange={(e) => go(Number(e.target.value))}
            aria-label="Page or picture"
          >
            {images.map((img, i) => (
              <option key={img.id} value={i}>
                {img.label}
              </option>
            ))}
          </select>
          <Button
            variant="outline"
            size="sm"
            className="h-8 w-8 p-0"
            disabled={index === images.length - 1}
            onClick={() => go(index + 1)}
            title="Next"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <span className="text-xs text-muted-foreground">
          Drag over the picture to snapshot it
        </span>
      </div>

      <div className="flex max-h-[62vh] justify-center overflow-auto rounded-lg border border-border bg-muted/40 p-2">
        <div
          ref={frameRef}
          className="relative h-fit cursor-crosshair touch-none select-none overflow-hidden"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={image.url}
            alt={image.label}
            draggable={false}
            className="pointer-events-none block max-w-full"
            style={{ maxHeight: "none", width: Math.min(image.width, 900) }}
          />
          {box && (
            <div
              className="pointer-events-none absolute border-2 border-primary"
              style={{
                left: `${box.x * 100}%`,
                top: `${box.y * 100}%`,
                width: `${box.w * 100}%`,
                height: `${box.h * 100}%`,
                boxShadow: "0 0 0 9999px rgba(0,0,0,0.45)",
              }}
            />
          )}
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" size="sm" onClick={() => setBox(FULL)}>
          <Maximize className="mr-2 h-4 w-4" />
          Whole {image.label.includes("page") ? "page" : "picture"}
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button size="sm" disabled={!box} onClick={() => box && onApply(image.id, box)}>
            <Crop className="mr-2 h-4 w-4" />
            Use snapshot
          </Button>
        </div>
      </div>
    </div>
  );
}
