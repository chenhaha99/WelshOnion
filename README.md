<p align="center">
  <img src="apps/web/public/icon-512.png" width="120" alt="葱葱">
</p>

<h1 align="center">葱葱 WelshOnion</h1>

<p align="center">排计划的工具。一件事占多长时间，在时间线上就画多长一段。</p>

<p align="center">
  <a href="https://app.welshonion.com">打开网页版</a> ·
  <a href="https://welshonion.com">下载安卓版</a> ·
  <a href="https://linux.do">LINUX DO</a>
</p>

![电脑上的时间线：三天的安排，每件事按时长画成一段](screenshots/timeline.png)

哪天塞得太满、哪段空着，摆出来就看见了。清单能记住要做什么，看不出做不做得完。

改时间就是拖一下，还没松手就知道挪到了几点：

![拖动一件事改时间，指针上方写着新的钟点](screenshots/drag.gif)

开销记在每件事上，这里合起来看：哪类花得多，还有几笔没填。

![总览：一个环显示各类开销占比，下面每类一行](screenshots/overview.png)

手机上是同一条时间线，几天叠着放，想看哪天点哪天：

![手机上的时间线：几天堆在一起，展开的那天在条下面写出每件事](screenshots/phone.png)

## 怎么用

网页版不用注册，第一次进去点「看看示例计划」。也能装到电脑或手机桌面上，断网照样打开。

计划存在你自己的设备上，不上传任何服务器。

## 自己跑

需要 Node 22 以上和 pnpm。

```bash
pnpm install
pnpm --dir apps/web dev     # 开发模式
pnpm test                   # 单元测试
pnpm --dir apps/web e2e     # 真浏览器走查
```

打安卓安装包还要 JDK 21 和安卓 SDK：`pnpm --dir apps/web app:apk`

## 代码

这里是离线版的完整源码，不连任何服务器。登录、多设备同步这些要联网的功能不在这个仓库。

- `packages/core`：数据结构、所有改数据的操作、时间和开销的统计规则，用 [Yjs](https://github.com/yjs/yjs) 存。不碰界面。
- `apps/web`：界面。时间线、日程、总览三个视图，本机存储、离线安装，用 [Capacitor](https://capacitorjs.com/) 打成安卓 app。

## 交流

[LINUX DO](https://linux.do)

## 许可证

[AGPL-3.0](LICENSE)
