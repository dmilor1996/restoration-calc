# Android-приложение «Реставрация»

Обычное приложение для Android: внутри лежит весь сайт, поэтому оно работает без интернета.
Данные хранятся на телефоне; при входе через Google они синхронизируются с облаком (Firebase).

## Как получить новую версию приложения

1. Я вношу правки в сайт и отправляю их в репозиторий.
2. GitHub сам собирает приложение (около 3–5 минут).
3. На странице репозитория: **Actions → Android APK → последний запуск → внизу «Artifacts» → Restoration-apk**.
   Скачивается ZIP-архив, внутри — `Restoration.apk`.
4. Откройте `Restoration.apk` на телефоне и нажмите «Обновить». Данные сохранятся.

## Однократная настройка

### 1. Секреты для подписи (чтобы новые версии ставились поверх старой)

Репозиторий → **Settings → Secrets and variables → Actions → New repository secret**. Нужны два секрета:

| Имя | Что вставить |
| --- | --- |
| `RC_KEYSTORE_BASE64` | всё содержимое файла `keystore-base64.txt` |
| `RC_KEYSTORE_PASSWORD` | пароль из файла `keystore-INFO.txt` |

Файлы лежат в чате с Claude. В репозиторий их класть нельзя: репозиторий публичный.

### 2. Вход через Google в приложении

1. Консоль Firebase → проект `restoration-calc` → ⚙ **Project settings** → вкладка **General**.
2. Внизу **Your apps → Add app → Android**.
3. **Android package name:** `com.restoration.calc`. **Debug signing certificate SHA-1:** `3A:C6:A9:70:0B:A9:65:F4:5A:EE:4C:7C:42:41:0B:BA:FD:00:60:91`.
4. Нажмите **Register app**, затем **Download google-services.json**. Остальные шаги мастера пропустите.
5. Отдайте файл `google-services.json` Claude (прикрепить в чат). Он добавит его в проект.

## Как это устроено

- `android-app/` — проект Capacitor; `www/` создаётся при сборке копированием сайта из корня репозитория.
- Шрифты и Firebase SDK лежат в репозитории (`fonts/`, `js/vendor/firebase.js`), сайт не зависит от CDN.
- `.github/workflows/android.yml` — автосборка. Без секретов собирается тестовая debug-версия: она **не** обновляет установленную release-версию.
- Версия приложения: `1.0.<номер сборки>`.
