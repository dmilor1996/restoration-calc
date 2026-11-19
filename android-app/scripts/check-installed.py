"""Exercise the APK installed on the CI emulator, including Android's back dispatcher."""
import re
import subprocess
import time
import xml.etree.ElementTree as ET

PACKAGE = "com.restoration.calc"


def adb(*args):
    return subprocess.check_output(["adb", *args], text=True, timeout=18).strip()


def find(label, tap=False):
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
        time.sleep(0.5)
    raise RuntimeError(f"Missing {label!r}. Visible labels: {labels}")


def launch():
    adb("shell", "am", "start", "-W", "-n", PACKAGE + "/.MainActivity")


adb("shell", "cmd", "connectivity", "airplane-mode", "enable")
launch()
find("Демоданные")
find("Мастерская", tap=True)
find("Расходники", tap=True)
find("3M Xtract 710W")
adb("shell", "input", "keyevent", "KEYCODE_BACK")
find("Ближайший выезд")
find("Калькулятор", tap=True)
find("Заказы")
adb("shell", "input", "keyevent", "KEYCODE_BACK")
find("Ближайший выезд")
adb("shell", "am", "force-stop", PACKAGE)
launch()
find("Демоданные")
print("Offline cold launch, workshop, calculator, native Back and restart passed.")
