/** Prepare a bounded local editing source; only the final crop is saved. */
export async function prepareGroupPicture(file: File): Promise<string> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("Choose a JPG, PNG, or WebP picture.");
  if (file.size > 8 * 1024 * 1024) throw new Error("Choose a picture smaller than 8 MB.");
  let image: ImageBitmap;
  try { image = await createImageBitmap(file); }
  catch { throw new Error("This picture couldn't be opened. Try another file."); }
  try {
    const scale = Math.min(1, 1920 / image.width, 1920 / image.height);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * scale)); canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Picture preview is unavailable. Please retry.");
    context.fillStyle = "#f2f6ef"; context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const cover = canvas.toDataURL("image/jpeg", .82);
    return cover;
  } finally { image.close(); }
}
