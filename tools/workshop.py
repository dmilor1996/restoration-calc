"""Windows development commands for the workshop. Python 3.9+, standard library."""
import argparse
import base64
from datetime import datetime, timezone
import hashlib
import json
import msvcrt
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import time
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / "android-app"
ANDROID = APP / "android"
OUT = ROOT / "artifacts"
APK = OUT / "apk" / "workshop-debug.apk"
AVD = "Workshop_QA_API34"
IMAGE = "system-images;android-34;google_apis;x86_64"
PKG = "com.restoration.calc"
LOCAL = Path(os.environ.get("LOCALAPPDATA", Path.home()))
SDK = Path(os.environ.get("ANDROID_HOME") or os.environ.get("ANDROID_SDK_ROOT") or LOCAL / "Android/Sdk")
ADB = SDK / "platform-tools/adb.exe"
EMU = SDK / "emulator/emulator.exe"
GRADLE = ANDROID / "gradlew.bat"
NPM = shutil.which("npm.cmd") or "npm.cmd"
os.environ["ANDROID_HOME"] = str(SDK)
os.environ["PYTHONUTF8"] = "1"
sys.stdout.reconfigure(errors="backslashreplace")


def run(args, cwd=ROOT, capture=False):
    if not capture and os.environ.get("WORKSHOP_RUN_LOG"):
        with subprocess.Popen(list(map(str, args)), cwd=cwd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT) as proc:
            with open(os.environ["WORKSHOP_RUN_LOG"], "ab") as log:
                for line in proc.stdout:
                    log.write(line)
                    print(line.decode("utf-8", errors="replace").rstrip(), flush=True)
            if proc.wait():
                raise subprocess.CalledProcessError(proc.returncode, args)
        return
    result = subprocess.run(list(map(str, args)), cwd=cwd, check=True,
                            stdout=subprocess.PIPE if capture else None)
    if capture:
        return result.stdout.decode("utf-8", errors="replace").strip()


def configure_java():
    homes = [os.environ.get("WORKSHOP_JDK"), os.environ.get("JAVA_HOME"),
             *sorted((LOCAL / "Programs/Workshop-JDK21").glob("*"), reverse=True),
             Path(os.environ.get("ProgramFiles", "C:/Program Files")) / "Android/Android Studio/jbr"]
    for home in filter(None, homes):
        release = Path(home) / "release"
        if release.is_file() and re.search(r'^JAVA_VERSION="21[."]', release.read_text(), re.M):
            os.environ["JAVA_HOME"] = str(home)
            return Path(home)
    raise RuntimeError("Set WORKSHOP_JDK to a JDK 21 installation. See docs/DEVELOPMENT.md.")


def doctor():
    java = configure_java()
    for cmd in [["git", "--version"], ["node", "--version"], [NPM, "--version"],
                [java / "bin/java.exe", "-version"], [ADB, "version"], [EMU, "-accel-check"],
                [EMU, "-list-avds"], [ADB, "devices", "-l"], [GRADLE, "--version"]]:
        run(cmd, ANDROID)
    for path in [SDK / "platforms/android-35/android.jar", SDK / "build-tools/35.0.0/aapt2.exe"]:
        if not path.is_file():
            raise FileNotFoundError(path)
    print(f"SDK={SDK}\nJDK={java}\nChrome={chrome()}\nPython={sys.version}\nAPK={APK}", flush=True)


def chrome():
    for path in [os.environ.get("CHROME_BIN"),
                 Path(os.environ.get("ProgramFiles", "C:/Program Files")) / "Google/Chrome/Application/chrome.exe",
                 Path(os.environ.get("ProgramFiles(x86)", "C:/Program Files (x86)")) / "Microsoft/Edge/Application/msedge.exe"]:
        if path and Path(path).is_file():
            return str(path)
    raise RuntimeError("Set CHROME_BIN to an installed Chromium browser.")


def deps():
    marker = APP / "node_modules/.workshop-deps"
    fingerprint = hashlib.sha256((APP / "package-lock.json").read_bytes() +
                                 (APP / "package.json").read_bytes() +
                                 run(["node", "--version"], capture=True).encode()).hexdigest()
    if marker.is_file() and marker.read_text() == fingerprint and (APP / "node_modules/.bin/cap.cmd").is_file():
        return
    if (APP / "node_modules").is_dir():
        configure_java()
        run([GRADLE, "--stop"], ANDROID)
    run([NPM, "ci", "--no-audit", "--no-fund"], APP)
    marker.write_text(fingerprint)


def tests():
    deps()
    os.environ["CHROME_BIN"] = chrome()
    run([NPM, "test"], APP)


def gradle(*tasks):
    configure_java()
    run([GRADLE, *tasks, "--max-workers=2", "--console=plain"], ANDROID)


def sync():
    deps()
    run([NPM, "run", "sync"], APP)


def build():
    sync()
    gradle(":app:assembleDebug")
    APK.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(ANDROID / "app/build/outputs/apk/debug/app-debug.apk", APK)
    print(APK, flush=True)


def quality():
    sync()
    gradle(":app:lintDebug", ":app:testDebugUnitTest")
    run(["git", "diff", "--check"])


def qa_serial():
    for line in run([ADB, "devices"], capture=True).splitlines():
        match = re.fullmatch(r"(emulator-\d+)\s+device", line.strip())
        if match:
            serial = match.group(1)
            if run([ADB, "-s", serial, "emu", "avd", "name"], capture=True).splitlines()[0].strip() == AVD:
                return serial
    return None


def device():
    serial = qa_serial()
    if not serial:
        raise RuntimeError(f"Start the QA emulator with dev.ps1 emulator ({AVD}).")
    return serial


def emulator():
    serial = qa_serial()
    if AVD not in run([EMU, "-list-avds"], capture=True).splitlines():
        configure_java()
        manager = SDK / "cmdline-tools/latest/bin/avdmanager.bat"
        subprocess.run([str(manager), "create", "avd", "-n", AVD, "-k", IMAGE, "-d", "medium_phone"],
                       input=b"no\n", check=True)
    if not serial:
        OUT.mkdir(exist_ok=True)
        with (OUT / "emulator.log").open("ab") as output:
            subprocess.Popen([str(EMU), "-avd", AVD, "-no-window", "-no-snapshot", "-no-audio",
                              "-no-boot-anim", "-gpu", "swiftshader_indirect", "-feature", "-Vulkan", "-cores", "2", "-memory", "2048"],
                             stdin=subprocess.DEVNULL, stdout=output, stderr=output,
                             creationflags=subprocess.CREATE_NEW_PROCESS_GROUP)
    until = time.monotonic() + 300
    while time.monotonic() < until:
        serial = qa_serial()
        if serial and run([ADB, "-s", serial, "shell", "getprop", "sys.boot_completed"], capture=True) == "1":
            try:
                ready = run([ADB, "-s", serial, "shell", "pm", "path", "android"], capture=True)
            except subprocess.CalledProcessError:
                ready = ""
            if not ready.startswith("package:"):
                time.sleep(2)
                continue
            run([ADB, "-s", serial, "shell", "input", "keyevent", "KEYCODE_WAKEUP"])
            run([ADB, "-s", serial, "shell", "wm", "dismiss-keyguard"])
            print(f"{AVD} {serial}", flush=True)
            return
        time.sleep(2)
    raise RuntimeError(f"QA boot timeout. See {OUT / 'emulator.log'}")


def adb(*args, capture=False):
    return run([ADB, "-s", device(), *args], capture=capture)


def install():
    if not APK.is_file():
        raise FileNotFoundError("Run dev.ps1 build first.")
    adb("install", "-r", APK)


def start():
    adb("shell", "am", "start", "-W", "-n", f"{PKG}/.MainActivity")


def stop():
    adb("shell", "am", "force-stop", PKG)


def evidence(folder):
    folder.mkdir(parents=True, exist_ok=True)
    serial = device()
    with (folder / "screen.png").open("wb") as png:
        subprocess.run([str(ADB), "-s", serial, "exec-out", "screencap", "-p"], stdout=png, check=True)
    for attempt in range(3):
        adb("shell", "uiautomator", "dump", "/data/local/tmp/workshop.xml")
        adb("pull", "/data/local/tmp/workshop.xml", folder / "window.xml")
        tree = ET.parse(folder / "window.xml")
        webview = tree.find(".//node[@class='android.webkit.WebView']")
        if webview is None or any(n.get("text") for n in webview.iter("node") if n is not webview):
            break
        time.sleep(0.5)
    print(folder, flush=True)


def logs(folder):
    folder.mkdir(parents=True, exist_ok=True)
    for name, options in [("logcat", ["logcat", "-d", "-t", "2500", "-v", "threadtime"]),
                          ("crash", ["logcat", "-d", "-b", "crash"]),
                          ("exit-info", ["shell", "dumpsys", "activity", "exit-info", PKG])]:
        (folder / (name + ".txt")).write_text(adb(*options, capture=True), encoding="utf-8")


def ui(*args):
    env = dict(os.environ, ANDROID_SERIAL=device(), WORKSHOP_ADB=str(ADB))
    subprocess.run(["node", "scripts/workshop-ui.mjs", *args], cwd=APP, env=env, check=True)


def native():
    env = dict(os.environ, ANDROID_SERIAL=device(), WORKSHOP_ADB=str(ADB))
    subprocess.run([sys.executable, str(APP / "scripts/check-installed.py")], env=env, check=True)


def verify(folder):
    folder.mkdir(parents=True)
    os.environ["WORKSHOP_RUN_LOG"] = str(folder / "build-test.log")
    report = {"started": datetime.now(timezone.utc).isoformat(), "commit": run(["git", "rev-parse", "HEAD"], capture=True),
              "worktree": run(["git", "status", "--porcelain"], capture=True), "avd": AVD, "steps": []}
    def record():
        (folder / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    def check_crashes():
        logs(folder)
        if PKG in (folder / "crash.txt").read_text(encoding="utf-8"):
            raise RuntimeError("Application named in Android crash buffer; see crash.txt")
    try:
        for name, action in [("doctor", doctor), ("tests", tests), ("quality", quality), ("build", build),
                             ("emulator", emulator), ("install", install), ("start", start),
                             ("crash baseline", lambda: adb("logcat", "-b", "crash", "-c")),
                             ("installed WebView", lambda: ui("smoke")), ("evidence", lambda: evidence(folder)),
                             ("offline native UI", native),
                             ("crashes", check_crashes)]:
            print(f"\n=== {name} ===", flush=True)
            step = {"name": name, "status": "running"}
            report["steps"].append(step)
            record()
            action()
            step["status"] = "passed"
        report["apk_sha256"] = hashlib.sha256(APK.read_bytes()).hexdigest()
        report["passed"] = True
    except Exception as exc:
        step.update(status="failed", error=str(exc))
        report["passed"] = False
        if qa_serial():
            for capture in (logs, evidence):
                try:
                    capture(folder)
                except Exception as diagnostic_error:
                    print(diagnostic_error, file=sys.stderr)
        raise
    finally:
        record()
        print(folder / "report.json", flush=True)


def main():
    commands = dict(doctor=doctor, deps=deps, build=build, test=tests, quality=quality, emulator=emulator,
                    install=install, start=start, stop=stop, ui=ui, native=native)
    folder = OUT / "runs" / datetime.now().strftime("%Y%m%d-%H%M%S-%f")
    commands.update(capture=lambda: evidence(folder), logs=lambda: logs(folder), verify=lambda: verify(folder))
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=list(commands))
    parser.add_argument("args", nargs="*")
    argv = sys.argv[1:]
    if len(argv) == 2 and argv[0] == "--powershell-args":
        argv = json.loads(base64.b64decode(argv[1]).decode("utf-8"))
    args = parser.parse_args(argv)
    if args.args and args.command != "ui":
        parser.error("Only ui accepts extra arguments.")
    if args.command in {"verify", "deps", "test", "quality", "build"}:
        OUT.mkdir(exist_ok=True)
        with (OUT / "build.lock").open("a+b") as lock:
            lock.seek(0)
            try:
                msvcrt.locking(lock.fileno(), msvcrt.LK_NBLCK, 1)
            except OSError:
                raise RuntimeError("Another workshop build or test is in progress.") from None
            commands[args.command](*args.args)
    else:
        commands[args.command](*args.args)


if __name__ == "__main__":
    try:
        main()
    except (OSError, RuntimeError, subprocess.CalledProcessError) as error:
        sys.exit(str(error))
