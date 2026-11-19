"""Exercise the APK installed on the CI emulator, including Android's back dispatcher."""
import re
import subprocess
import time
import xml.etree.ElementTree as ET

PACKAGE = "com.restoration.calc"


def adb(*args):
    return subprocess.check_output(["adb", *args], text=True, timeout=18).strip()


def find(label, tap=False, scroll=False):
    deadline = time.monotonic() + 45
    labels = []
    while time.monotonic() < deadline:
        try:
            adb("shell", "uiautomator", "dump", "/sdcard/workshop-window.xml")
            tree = ET.fromstring(adb("exec-out", "cat", "/sdcard/workshop-window.xml"))
            labels = []
            for node in tree.iter("node"):
                names = [node.get("text", ""), node.get("content-desc", "")]
                labels.extend(filter(None, names))
                if label not in names:
                    continue
                if tap:
                    x1, y1, x2, y2 = map(int, re.findall(r"\d+", node.get("bounds")))
                    adb("shell", "input", "tap", str((x1 + x2) // 2), str((y1 + y2) // 2))
                return
        except (ET.ParseError, subprocess.SubprocessError):
            pass
        if scroll:
            adb("shell", "input", "swipe", "480", "1330", "480", "650", "350")
        time.sleep(0.5)
    raise RuntimeError(f"Missing {label!r}. Visible labels: {labels}")


def launch():
    adb("shell", "am", "start", "-W", "-n", PACKAGE + "/.MainActivity")


adb("shell", "cmd", "connectivity", "airplane-mode", "enable")
launch()
find("Объекты", tap=True)
find("Создать объект", tap=True)
find("Новый объект")
find("Создать объект", tap=True)
find("Начать работу", tap=True)
find("Пауза", tap=True)
find("Продолжить этап")
adb("shell", "am", "force-stop", PACKAGE)
launch()
find("Столешница", tap=True)
find("Продолжить этап", tap=True)
find("Завершить выезд", tap=True, scroll=True)
find("Начать новый выезд", tap=True)
find("Пауза")
adb("shell", "am", "force-stop", PACKAGE)
launch()
find("Столешница", tap=True)
find("Пауза")
find("Калькулятор", tap=True)
find("Заказы")
adb("shell", "input", "keyevent", "KEYCODE_BACK")
find("Пауза")
print("Offline create, pause, process death, resume, second visit, calculator and native Back passed.")
