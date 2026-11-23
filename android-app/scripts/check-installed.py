"""Exercise the APK installed on the CI emulator, including Android's back dispatcher."""
import os
import re
import sys
import subprocess
import time
import xml.etree.ElementTree as ET

PACKAGE = "com.restoration.calc"


ADB = os.environ.get("WORKSHOP_ADB", "adb")
SERIAL = os.environ.get("ANDROID_SERIAL") or subprocess.check_output([ADB, "get-serialno"], text=True).strip()
if not re.fullmatch(r"emulator-\d+", SERIAL):
    sys.exit("An explicitly selected emulator is required.")


def adb(*args):
    return subprocess.check_output([ADB, "-s", SERIAL, *args], encoding="utf-8", timeout=30).strip()


avd = adb("emu", "avd", "name").splitlines()[0].strip()
if avd != "Workshop_QA_API34" and os.environ.get("GITHUB_ACTIONS") != "true":
    sys.exit("Use the dedicated Workshop_QA_API34 emulator.")


def bounds(node):
    return list(map(int, re.findall(r"-?\d+", node.get("bounds", ""))))


def find(label, tap=False, scroll=False, select=False):
    deadline = time.monotonic() + 45
    labels = []
    while time.monotonic() < deadline:
        try:
            adb("shell", "uiautomator", "dump", "/sdcard/workshop-window.xml")
            tree = ET.fromstring(adb("exec-out", "cat", "/sdcard/workshop-window.xml"))
            labels = []
            nodes = list(tree.iter("node"))
            # The emulator launcher can time out during cold boot and cover the
            # already started activity. Recover only from this unrelated dialog.
            if any(node.get("text") == "Pixel Launcher isn't responding" for node in nodes):
                adb("shell", "am", "force-stop", "com.google.android.apps.nexuslauncher")
                launch()
                continue
            dock = next((node for node in nodes if "Разделы мастерской" in
                         (node.get("text"), node.get("content-desc"))), None)
            # The HTML dock always occupies the bottom of the viewport. Some
            # WebView releases flatten its children in the accessibility tree.
            dock_top = bounds(dock)[1] if dock is not None else 0
            if dock_top < height // 2:
                dock_top = height * 85 // 100
            if select:
                # WebView exposes the caption and the select under the same
                # accessible name. Prefer the native spinner, then the lowest
                # matching node (the actual field beneath its caption).
                matches = [node for node in nodes if label in (node.get("text"), node.get("content-desc"))]
                nodes = sorted(matches, key=lambda node: (
                    node.get("class") == "android.widget.Spinner",
                    bounds(node)[1],
                ), reverse=True)
            for node in nodes:
                names = [node.get("text", ""), node.get("content-desc", "")]
                labels.extend(filter(None, names))
                if label not in names and label != node.get("class"):
                    continue
                if tap:
                    x1, y1, x2, y2 = bounds(node)
                    # WebView accessibility also exposes controls covered by the fixed dock.
                    # Tap only their visible area, then scroll and inspect a fresh tree if needed.
                    in_dock = label in {"Главная", "Заказы", "Мастерская", "Прогресс", "Калькулятор"}
                    y2 = min(y2, height if in_dock else dock_top - 4)
                    if x2 <= x1 or y2 - y1 < 6:
                        continue
                    adb("shell", "input", "tap", str((x1 + x2) // 2), str((y1 + y2) // 2))
                return
        except (ET.ParseError, subprocess.SubprocessError):
            pass
        if scroll:
            adb("shell", "input", "swipe", str(width//2), str(height*2//3), str(width//2), str(height//3), "320")
        time.sleep(0.5)
    raise RuntimeError(f"Missing {label!r}. Visible labels: {labels}")


def launch():
    adb("shell", "am", "start", "-W", "-n", PACKAGE + "/.MainActivity")


width, height = map(int, re.findall(r"(\d+)x(\d+)", adb("shell", "wm", "size"))[-1])
title = "QA" + str(time.time_ns())
airplane = adb("shell", "settings", "get", "global", "airplane_mode_on")
try:
    adb("shell", "cmd", "connectivity", "airplane-mode", "enable")
    launch()
    find("Заказы", tap=True)
    find("Новый заказ", tap=True)
    find("android.widget.EditText", tap=True)
    adb("shell", "input", "text", title)
    if "mInputShown=true" in adb("shell", "dumpsys", "input_method"):
        adb("shell", "input", "keyevent", "KEYCODE_BACK")
    find("Клиент и детали заказа (необязательно)", tap=True, scroll=True)
    find("Категория для поиска и статистики", tap=True, select=True, scroll=True)
    find("Лестница", tap=True)
    find("Создать заказ", tap=True, scroll=True)
    find("Начать работу", tap=True, scroll=True)
    find("Пауза", tap=True)
    find("Продолжить этап")
    adb("shell", "am", "force-stop", PACKAGE)
    launch()
    find(title, tap=True)
    find("Продолжить этап", tap=True)
    find("Завершить работу на сегодня", tap=True, scroll=True)
    find("Начать следующий рабочий день", tap=True, scroll=True)
    find("Пауза")
    adb("shell", "am", "force-stop", PACKAGE)
    launch()
    find(title, tap=True)
    find("Пауза")
    find("Калькулятор", tap=True)
    find("Известная площадь")
    adb("shell", "input", "keyevent", "KEYCODE_BACK")
    find("Пауза")
    find("Завершить работу на сегодня", tap=True, scroll=True)
    find("Начать следующий рабочий день")
    print("Offline category selection, two days, process death and native Back passed.")
finally:
    if airplane == "0":
        adb("shell", "cmd", "connectivity", "airplane-mode", "disable")
