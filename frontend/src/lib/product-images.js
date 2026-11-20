const modules = import.meta.glob(
  "../assets/products_images/*.{png,jpeg,jpg,webp}",
  { eager: true, import: "default" },
)

// Basename → bundled URL. The database stores image_name WITH its extension,
// so the lookup is exact (e.g. "Suede_Harrington_Jacket.png").
const IMAGE_BY_NAME = Object.fromEntries(
  Object.entries(modules).map(([path, mod]) => [
    path.split("/").pop(),
    mod?.default ?? mod,
  ]),
)

export function productImage(imageName) {
  return IMAGE_BY_NAME[imageName] ?? null
}
