<p align="center">
  <img src="apps/web/public/icon-512.png" width="120" alt="葱葱 WelshOnion">
</p>

<h1 align="center">葱葱 WelshOnion</h1>

<p align="center">
  排计划的工具。一件事占多长时间，在时间线上就画多长一段。
  <br>
  <em>A planner built on a timeline: everything takes up as much room as it takes time.</em>
</p>

<p align="center">
  <a href="https://app.welshonion.com">网页版 Web</a> ·
  <a href="https://welshonion.com">安卓版 Android</a> ·
  <a href="https://linux.do">LINUX DO</a>
</p>

![电脑上的时间线：三天的安排，每件事按时长画成一段](screenshots/timeline.png)

哪天塞得太满、哪段空着，摆出来就看见了。清单能记住要做什么，看不出做不做得完。<br>
*You can see which day is overpacked and which stretch sits empty. A checklist remembers what to do, but not whether it all fits.*

改时间就是拖一下，还没松手就知道挪到了几点：<br>
*Drag to reschedule. The new time shows up before you let go:*

![拖动一件事改时间，指针上方写着新的钟点](screenshots/drag.gif)

开销记在每件事上，这里合起来看：哪类花得多，还有几笔没填。<br>
*Costs go on each item and add up here: which kind takes the most, and how many are still blank.*

![总览：一个环显示各类开销占比，下面每类一行](screenshots/overview.png)

手机上是同一条时间线，几天叠着放，想看哪天点哪天：<br>
*Same timeline on a phone. Days stack up, tap one to open it:*

![手机上的时间线：几天堆在一起，展开的那天在条下面写出每件事](screenshots/phone.png)

## 怎么用 · How to use

网页版不用注册，第一次进去点「看看示例计划」。也能装到电脑或手机桌面上，断网照样打开。<br>
*No sign-up. Open the web version and tap "See a sample plan". You can install it to your desktop or home screen, and it still opens offline.*

计划存在你自己的设备上，不上传任何服务器。<br>
*Your plans stay on your own device. Nothing is uploaded.*

## 自己跑 · Run it yourself

需要 Node 22 以上和 pnpm。<br>
*Needs Node 22+ and pnpm.*

```bash
pnpm install
pnpm --dir apps/web dev     # 开发模式 / dev server
pnpm test                   # 单元测试 / unit tests
pnpm --dir apps/web e2e     # 真浏览器走查 / end-to-end tests
```

打安卓安装包还要 JDK 21 和安卓 SDK：`pnpm --dir apps/web app:apk`<br>
*Building the Android package also needs JDK 21 and the Android SDK.*

## 代码 · Code

这里是离线版的完整源码，不连任何服务器。登录、多设备同步这些要联网的功能不在这个仓库。<br>
*This is the complete source of the offline version. Accounts and cross-device sync are not in this repo.*

- `packages/core`：数据结构、所有改数据的操作、时间和开销的统计规则，用 [Yjs](https://github.com/yjs/yjs) 存。不碰界面。<br>
  *Data model, every edit operation, and the time and cost rules. Stored with Yjs. No UI.*
- `apps/web`：界面。时间线、日程、总览三个视图，本机存储、离线安装，用 [Capacitor](https://capacitorjs.com/) 打成安卓 app。<br>
  *The UI: timeline, day list and overview. Local storage, offline install, packaged for Android with Capacitor.*

## 交流 · Chat

[LINUX DO](https://linux.do)

## 许可证 · License

[AGPL-3.0](LICENSE)
