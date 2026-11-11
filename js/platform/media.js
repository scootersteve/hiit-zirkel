// Browser side of the personal media (see core/media.js): turn a chosen photo into a small
// JPEG, and hand out object URLs for stored pictures.

import { fitWithin, IMAGE_MAX_EDGE } from '../core/media.js';

async function decode(file) {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      /* some formats only decode through an <img>: fall through */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Photo → JPEG with the longer side at most IMAGE_MAX_EDGE. A phone photo of several megabytes
 * becomes a few hundred kilobytes, which is all a dimmed background needs.
 * Resolves to { type, bytes }.
 */
export async function photoToJpeg(file) {
  let source;
  try {
    source = await decode(file);
  } catch {
    throw new Error('Das Bild lässt sich nicht lesen.');
  }
  const { width, height } = fitWithin(source.width || source.naturalWidth, source.height || source.naturalHeight, IMAGE_MAX_EDGE);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d').drawImage(source, 0, 0, width, height);
  source.close?.();
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.82));
  if (!blob) throw new Error('Das Bild lässt sich nicht umwandeln.');
  return { type: 'image/jpeg', bytes: await blob.arrayBuffer() };
}

/** Object URL for a stored record; the caller revokes it when the picture is replaced. */
export const recordUrl = (record) => URL.createObjectURL(new Blob([record.bytes], { type: record.type || 'application/octet-stream' }));
