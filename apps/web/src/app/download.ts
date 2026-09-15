/** 过多久释放下载链接（毫秒）：马上释放的话，有的浏览器还没开始下载链接就失效了 */
const REVOKE_AFTER_MS = 60_000;

/** 把一段 JSON 文字存成文件下载：包成 Blob，用带 download 的临时链接点一下。 */
export function downloadJson(fileName: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", fileName);
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_AFTER_MS);
}
