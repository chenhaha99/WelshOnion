import { Directory, Encoding, Filesystem } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import { isNativeApp } from "./native";

/** 过多久释放下载链接（毫秒）：马上释放的话，有的浏览器还没开始下载链接就失效了 */
const REVOKE_AFTER_MS = 60_000;

/**
 * 把一段 JSON 文字存成文件交给用户：浏览器里下载；app 里写进缓存目录，再弹出系统分享这个文件
 * （安卓的网页视图不处理下载链接）。分享被取消返回 false；写文件、分享出别的错照常抛出。
 */
export async function saveJsonFile(fileName: string, text: string): Promise<boolean> {
  if (!isNativeApp()) {
    downloadJson(fileName, text);
    return true;
  }
  const { uri } = await Filesystem.writeFile({ path: fileName, data: text, directory: Directory.Cache, encoding: Encoding.UTF8 });
  try {
    await Share.share({ title: fileName, files: [uri] });
  } catch (error) {
    if (error instanceof Error && /cancel/i.test(error.message)) return false;
    throw error;
  }
  return true;
}

/** 浏览器里：包成 Blob，用带 download 的临时链接点一下。 */
function downloadJson(fileName: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", fileName);
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_AFTER_MS);
}
