import { Capacitor } from "@capacitor/core";
import { Directory, Encoding, Filesystem } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";

export const nativeFiles = Capacitor.isNativePlatform();

/**
 * Write a file to the phone's public Documents folder (Documents/Taraz/) and
 * open the share sheet so it can go straight to Drive, Telegram or a computer.
 * The WebView swallows `<a download>`, so this is the only reliable save on
 * Android. Returns the folder-relative path that was written.
 */
export async function saveFileNative(filename: string, text: string): Promise<string> {
  const path = `Taraz/${filename}`;
  const { uri } = await Filesystem.writeFile({
    path,
    data: text,
    directory: Directory.Documents,
    encoding: Encoding.UTF8,
    recursive: true,
  });
  try {
    await Share.share({ title: filename, url: uri, dialogTitle: "ذخیره‌ی پشتیبان" });
  } catch {
    // Dismissing the sheet is fine: the file is already on the device.
  }
  return `Documents/${path}`;
}
