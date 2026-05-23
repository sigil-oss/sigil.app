import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";

function sanitizeDefaultName(defaultName: string): string {
  const trimmed = defaultName.trim().replace(/\\/g, "/");
  const leaf = trimmed.split("/").pop() ?? "";
  const cleaned = leaf.replace(/\.\.+/g, ".").trim();
  return cleaned || "sigil-export.json";
}

export async function saveFileDialog(
  defaultName: string,
  content: string,
  filters: { name: string; extensions: string[] }[] = [{ name: "JSON", extensions: ["json"] }],
): Promise<boolean> {
  try {
    const path = await save({ defaultPath: sanitizeDefaultName(defaultName), filters });
    if (!path) return false;
    await writeTextFile(path, content);
    return true;
  } catch (err) {
    console.error("[sigil] save file failed:", err);
    return false;
  }
}
