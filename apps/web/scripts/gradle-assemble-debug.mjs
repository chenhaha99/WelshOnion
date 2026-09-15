// 在 android/ 里用 Gradle 打调试版安装包：Windows 上是 gradlew.bat，别的系统是 ./gradlew
// 事先要设好 JAVA_HOME（JDK 21）和 ANDROID_HOME（安卓 SDK 的目录）
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const android = fileURLToPath(new URL("../android/", import.meta.url));
const windows = process.platform === "win32";
// 写明当前目录：有的 Windows 环境里 cmd 不在当前目录找命令
const result = spawnSync(windows ? ".\\gradlew.bat" : "./gradlew", ["assembleDebug"], { cwd: android, stdio: "inherit", shell: windows });
process.exit(result.status ?? 1);
