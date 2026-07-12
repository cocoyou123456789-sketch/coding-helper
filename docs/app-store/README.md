# 题解簿 iOS 首次上架清单

## App identity

- Chinese name: `题解簿`
- English name: `Sakura Algo Notebook`
- Bundle ID: `com.coocylh.tijiebu`
- Version: `1.0.0`
- Primary category: Education
- Suggested subtitle (zh): `会写代码，也会讲明白`
- Suggested subtitle (en): `Learn patterns, code, and reflect`

Do not use `LeetCode`, `力扣`, `Hot 100`, Duolingo, or Kahoot in the App Store name, subtitle, icon, screenshots, keywords, or promotional text without written authorization.

## Public URLs

- Privacy: <https://cocoyou123456789-sketch.github.io/coding-helper/privacy/>
- Support: <https://cocoyou123456789-sketch.github.io/coding-helper/support/>
- Licenses: <https://cocoyou123456789-sketch.github.io/coding-helper/licenses/>

Before submission, add a real support email controlled by the developer to the support and privacy pages.

## App Privacy draft

The intended 1.0 build has no account, advertising, analytics, or tracking. Code, notes, progress, preferences, and reminder settings remain on device. The Python runtime, standard library, lesson content, and tests are bundled with the app.

Select `Data Not Collected` only after validating the release archive contains no analytics SDK, remote runtime, remote script, or other data-collecting integration.

## Review notes

> This is a self-contained educational coding application. The Capacitor/WKWebView interface loads only app-bundled assets and does not load a remote website. All lessons, tests, and the pinned Pyodide runtime are included in the application bundle. The app does not download scripts, interpreters, Python packages, plug-ins, or other executable content.
>
> Python execution is limited to user-authored educational exercises. All user source code is fully visible and editable. Execution occurs locally in a Web Worker/WebAssembly environment and is terminated after 20 seconds. It has no access to native iOS APIs or user files.
>
> No account is required. The app contains no advertising, analytics, or tracking. Code, notes, and progress remain on device and can be exported or deleted from Settings. Native functionality includes local study reminders, haptic test feedback, durable local preferences, and system share/export.
>
> Review path: open the app → choose an Easy lesson → open Full Practice → run an included quick test → write a review note → use Share Notes from the notes screen.

## Xcode and App Store Connect

1. Install Xcode 26 or newer and an iOS Simulator runtime.
2. Open `ios/App/App.xcodeproj` after running `npm run ios:sync`.
3. Select the developer team and confirm bundle ID `com.coocylh.tijiebu`.
4. Confirm iOS deployment target is 15.0 or newer.
5. Confirm `PrivacyInfo.xcprivacy` and the 1024×1024 icon are included in the App target.
6. Test offline launch, Python execution, notes persistence, deletion, reminders, sharing, dark/light system settings, iPad layout, and interrupted/backgrounded runs.
7. Archive with the iOS 26 SDK, validate the archive, and upload it to App Store Connect.
8. Test with TestFlight before submitting version 1.0 for review.

## Screenshot plan

Use real iPhone screenshots showing:

1. Study Home and the four-step learning path.
2. A paraphrased problem with the Python editor.
3. Passing on-device quick tests.
4. Line-by-line explanations and reflection notes.
5. Daily reminder settings and system share/export.

Prepare separate Chinese and English screenshot sets. Do not show third-party product names, logos, websites, or copied problem statements.
