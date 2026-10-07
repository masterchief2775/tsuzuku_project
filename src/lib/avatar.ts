/**
 * Avatar upload pipeline — shared by the profile page and the public profile.
 *
 * These two screens had their own copy of the same canvas code and had already
 * drifted in a way that was visible to users: the public profile accepted any
 * file with no type or size check, had no JPEG fallback for browsers without
 * WebP (so `toDataURL` silently produced a PNG that blew past the size budget),
 * and leaked the object URL when the canvas context was unavailable.
 *
 * Throws a French, user-facing message; callers surface it as-is.
 */

const MAX_INPUT_BYTES = 8_000_000;
const MAX_DATA_URL_LENGTH = 60_000;

/** Crops to a centred square, draws it at `maxSize`, returns a data URL. */
export function resizeImageToDataUrl(
  file: File,
  maxSize: number,
  quality: number,
): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const side = Math.min(img.width, img.height);
        const sx = (img.width - side) / 2;
        const sy = (img.height - side) / 2;
        const canvas = document.createElement("canvas");
        canvas.width = maxSize;
        canvas.height = maxSize;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Canvas indisponible.");
        ctx.drawImage(img, sx, sy, side, side, 0, 0, maxSize, maxSize);
        let dataUrl = canvas.toDataURL("image/webp", quality);
        // Browsers without WebP encoding fall back to PNG, which is far heavier.
        if (!dataUrl.startsWith("data:image/webp")) {
          dataUrl = canvas.toDataURL("image/jpeg", quality);
        }
        resolve(dataUrl);
      } catch (err) {
        reject(err instanceof Error ? err : new Error("Traitement de l'image impossible."));
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Image illisible."));
    };
    img.src = objectUrl;
  });
}

/**
 * Full pipeline: validate, then try a crisp 256px square and fall back to 160px
 * if the result is still too heavy to store.
 */
export async function prepareAvatarDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Choisis une image (JPEG, PNG, WebP…).");
  }
  if (file.size > MAX_INPUT_BYTES) {
    throw new Error("Image trop lourde (max ~8 Mo).");
  }
  let dataUrl = await resizeImageToDataUrl(file, 256, 0.82);
  if (dataUrl.length > MAX_DATA_URL_LENGTH) {
    dataUrl = await resizeImageToDataUrl(file, 160, 0.7);
  }
  if (dataUrl.length > MAX_DATA_URL_LENGTH) {
    throw new Error("Cette image compresse mal — essaie une photo plus simple.");
  }
  return dataUrl;
}