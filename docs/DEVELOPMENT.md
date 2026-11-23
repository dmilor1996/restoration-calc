# Среда разработки Windows

Рабочая копия на этом ПК — C:\Projects\restoration-calc. Все команды ниже выполняются в PowerShell из корня. dev.ps1 вызывает Python 3 и передаёт код завершения. В среде с ограничением на запуск ps1 тот же интерфейс доступен через `py -3 tools/workshop.py verify`. Глобальные переменные среды задавать для этого не требуется.

## Восстановление на другом ПК

1. Установите Git, Node.js 22 с npm, Python 3.9+ и Chrome или Edge. Клонируйте репозиторий и выберите проверенную ветку по PROJECT_STATUS.md. Отдельный системный Gradle не требуется.
2. Нужен JDK 21 x64. Укажите каталог в WORKSHOP_JDK или JAVA_HOME текущего терминала. На подготовленном ПК обнаруживается Temurin в %LOCALAPPDATA%\Programs\Workshop-JDK21. Java 25 из Android Studio можно оставить среде Studio.
3. Android SDK обычно находится в %LOCALAPPDATA%\Android\Sdk. Альтернативное расположение задаётся ANDROID_HOME. В SDK Manager нужны platform-tools, emulator, командные инструменты latest, Android 35, Build Tools 35.0.0, а также версия Build Tools по умолчанию Android Gradle Plugin (34.0.0 на этом ПК). Для этого QA-профиля установите образ system-images;android-34;google_apis;x86_64. Для командной установки:

```powershell
$sdk = "$env:LOCALAPPDATA\Android\Sdk"
& "$sdk\cmdline-tools\latest\bin\sdkmanager.bat" "platform-tools" "emulator" "platforms;android-35" "build-tools;34.0.0" "build-tools;35.0.0" "system-images;android-34;google_apis;x86_64"
```

Для использования sdkmanager задайте JAVA_HOME текущего терминала на JDK, если команда его просит. Просмотрите предлагаемые лицензии SDK. Проверьте аппаратную виртуализацию командой `emulator.exe -accel-check` из каталога emulator. Первая сборка требует доступа к npm, Gradle, Google Maven и Maven Central. Для последующих сборок сохраняются node_modules, пользовательский кеш Gradle и промежуточные результаты.

## Команды

| Команда после .\dev.ps1 | Назначение |
| --- | --- |
| doctor | Проверить версии, JDK 21, SDK, браузер, ADB, ускорение и Gradle Wrapper |
| deps | Установить пакеты через npm ci по lock-файлу, повторно использовать при совпадении версии Node и файлов зависимостей |
| test | Формулы, модель и регрессии в браузере с временным профилем |
| quality | Sync, Android Lint, JVM-тест и git diff --check |
| build | Подготовить web assets, синхронизировать Capacitor и собрать debug APK |
| emulator | Создать при отсутствии и запустить отдельный Workshop_QA_API34, дождаться загрузки |
| install / start / stop | Установить готовый APK с -r, запустить Activity, остановить процесс без удаления данных |
| ui tree | Дерево доступности HTML действующего debug WebView |
| ui smoke | Создание и изменение заказа с русским текстом, восстановление после остановки процесса и проверка расчёта |
| native | Проверка системного списка, рабочих дней, авиарежима и системной кнопки Back средствами ADB и UI Automator |
| capture | Полный PNG экрана и нативное дерево window.xml |
| logs | Снимок Logcat, буфер crash и dumpsys activity exit-info |
| verify | Полная локальная проверка с JSON-отчётом по шагам и хешем APK |

Путь APK — `artifacts/apk/workshop-debug.apk`. Оригинал Gradle — `android-app/android/app/build/outputs/apk/debug/app-debug.apk`. Отчёты и диагностика — `artifacts/runs/<дата-время>/`. Android Lint — `android-app/android/app/build/reports/lint-results-debug.html`. Локальный debug APK подписывает отладочный ключ пользователя. На телефоне с release-подписью используется отдельный процесс обновления.

## Взаимодействие с экраном

```powershell
.\dev.ps1 emulator
.\dev.ps1 install
.\dev.ps1 start
.\dev.ps1 ui tree
.\dev.ps1 ui tap 'nav a[href="#projects"]'
.\dev.ps1 ui tap 'a[href="#projects/new"]'
.\dev.ps1 ui text '[data-testid=order-title]' 'Тестовая столешница'
.\dev.ps1 ui scroll '[data-testid=order-submit]'
.\dev.ps1 capture
```

Для передачи снимка в ИИ откройте последний screen.png через Desktop Commander read_file как изображение. Если клиент возвращает только текст, передайте PNG через его файловый интерфейс или прочтите бинарный PNG в Base64 и декодируйте в просмотрщике. На снимках тестового AVD должны быть только синтетические данные. Для ручной команды ADB используйте проверенный серийный номер и `-s`; `adb -s <serial> emu avd name` должен показать Workshop_QA_API34. Установка c -r сохраняет данные. При несовпадении подписи команда завершается ошибкой. Не удаляйте приложение ради обхода этой ошибки.

Playwright уже входит в lock-файл и подходит для доступных ролей, форм и ввода кириллицы в отладочном WebView. ADB и UI Automator проверяют системные экраны и release APK без веб-отладки. Espresso Web потребовал бы отдельной инструментальной сборки. Appium добавил бы сервер и драйвер, Maestro — отдельную среду исполнения сценариев. Их стоит рассматривать при появлении сценария, который существующие средства не покрывают.

При падении изучите report.json, screen.png, window.xml, crash.txt и exit-info.txt в каталоге запуска. Остановка через force-stop в тесте ожидаема. При проблемах холодной загрузки откройте artifacts/emulator.log. Для выключения завершите только QA-эмулятор: `adb -s <проверенный serial> emu kill`. При проблемах с загрузкой зависимостей посмотрите адрес и ошибку в выводе Gradle. Очистка кешей для обычной повторной сборки не нужна.

## Git на другом компьютере

```powershell
git clone --branch work/windows-dev-environment https://github.com/dmilor1996/restoration-calc.git C:\Projects\restoration-calc
cd C:\Projects\restoration-calc
git switch -c work/my-task
.\dev.ps1 doctor
.\dev.ps1 verify
```

Для публикации из PowerShell используйте авторизованный Git Credential Manager и обычный push новой ветки. Если GitHub отклоняет локальную учётную запись, доступ на чтение, локальные коммиты, сборка и проверка по-прежнему работают. Для публикации можно использовать уже авторизованную интеграцию GitHub. После такой публикации сверяйте дерево коммита, выполняйте git fetch и принимайте только fast-forward. Токены не передавайте в командной строке и не записывайте в репозиторий.
