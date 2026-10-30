// Runs in the BROWSER. Phone photos are often 5-10 MB, which is slow to upload and too big
// for the server limit (4 MB). This shrinks the photo to at most 1800 pixels on its longest
// side and saves it as a JPEG. That is still sharp enough for the AI to read small print.
export async function shrinkImage(file: File, maxSide = 1800, quality = 0.85): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file); // also applies the phone's rotation info
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (!blob) return file;
    return new File([blob], 'invoice.jpg', { type: 'image/jpeg' });
  } catch {
    // The browser could not open the image (for example HEIC in Chrome): send it unchanged.
    return file;
  }
}
