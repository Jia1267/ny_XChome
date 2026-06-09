'use client';

import { createContext, useCallback, useContext, useState } from 'react';
import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { useFocusTrap } from '../useDialog';

type ZoomContextValue = { open: (src: string, alt?: string) => void };

const ImageZoomContext = createContext<ZoomContextValue>({ open: () => undefined });

export function useImageZoom() {
  return useContext(ImageZoomContext);
}

// Provides a click-to-zoom lightbox. Wrap the app once; call useImageZoom().open(src)
// from any descendant image.
export function ImageZoomProvider({ children }: { children: ReactNode }) {
  const [image, setImage] = useState<{ src: string; alt: string } | null>(null);
  const open = useCallback((src: string, alt = '') => setImage({ src, alt }), []);
  const close = useCallback(() => setImage(null), []);
  const overlayRef = useFocusTrap<HTMLDivElement>(Boolean(image), close);

  return (
    <ImageZoomContext.Provider value={{ open }}>
      {children}
      {image && (
        <div ref={overlayRef} className="imageZoomOverlay" onClick={close} role="dialog" aria-modal="true" aria-label="Zoomed image">
          <button className="imageZoomClose" type="button" aria-label="Close" onClick={close}><X size={22} /></button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image.src} alt={image.alt} onClick={event => event.stopPropagation()} />
        </div>
      )}
    </ImageZoomContext.Provider>
  );
}
