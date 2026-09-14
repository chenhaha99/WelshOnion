import * as Y from "yjs";

/** 从别的标签页收到的改动带这个来源：不再转发出去，也不进本页的撤销（撤销只跟踪本机来源）。 */
const TAB_ORIGIN: object = Object.freeze({ source: "tab" });

// state：我有到哪（状态向量），请回我缺的；update：一段改动
type TabMessage = { type: "state"; data: Uint8Array } | { type: "update"; data: Uint8Array };

/**
 * 接上同一浏览器里的其他标签页，返回断开函数。照 y-websocket 的做法：
 * 接上时发自己的状态向量（请别人回我缺的）和全部内容（补上别人缺的），
 * 所以「加载完到接上之间」两边各自做的改动都不丢。
 */
export function connectTabs(doc: Y.Doc, channelName: string): () => void {
  const channel = new BroadcastChannel(channelName);
  const post = (message: TabMessage) => channel.postMessage(message);

  channel.onmessage = (event: MessageEvent<TabMessage>) => {
    const message = event.data;
    if (message.type === "state") {
      post({ type: "update", data: Y.encodeStateAsUpdate(doc, message.data) });
    } else {
      Y.applyUpdate(doc, message.data, TAB_ORIGIN);
    }
  };

  const forward = (update: Uint8Array, origin: unknown) => {
    if (origin !== TAB_ORIGIN) post({ type: "update", data: update });
  };
  doc.on("update", forward);

  post({ type: "state", data: Y.encodeStateVector(doc) });
  post({ type: "update", data: Y.encodeStateAsUpdate(doc) });

  return () => {
    doc.off("update", forward);
    channel.close();
  };
}
