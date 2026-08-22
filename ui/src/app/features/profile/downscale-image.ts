const AVATAR_SIZE = 256;

/** Downscales an image file to a small square JPEG and returns it as a data URI. */
export function downscaleImage(file: File, size = AVATAR_SIZE): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas 2D context is unavailable.'));
        return;
      }
      const side = Math.min(img.width, img.height);
      const sx = (img.width - side) / 2;
      const sy = (img.height - side) / 2;
      ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
      URL.revokeObjectURL(img.src);
      resolve(canvas.toDataURL('image/jpeg', 0.8));
    };
    img.onerror = () => {
      URL.revokeObjectURL(img.src);
      reject(new Error('Could not read the selected image.'));
    };
    img.src = URL.createObjectURL(file);
  });
}
