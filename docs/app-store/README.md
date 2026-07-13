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

The intended 1.0 build has no account, advertising, analytics, or tracking. Code, course links, recognized text, notes, progress, preferences, and reminder settings remain on device. Dictation starts only after an explicit tap and the app does not retain audio. On-device recognition is preferred where supported; older iOS versions may use Apple's speech service. The Python runtime, standard library, lesson content, and tests are bundled with the app.

Select `Data Not Collected` only after validating the release archive contains no analytics SDK, remote runtime, remote script, or other developer-controlled data-collecting integration, and after reviewing the current App Store privacy guidance for Apple Speech processing and the optional Bilibili external player.

## Review notes

> This is an educational coding and study-notes application. Its interface, lessons, tests, and pinned Pyodide runtime are included in the application bundle. It does not download scripts, interpreters, Python packages, plug-ins, or other executable content. An optional Course Notes screen lets the user paste a public Bilibili course URL. The third-party official player connects only after the user taps Load; the app never downloads, converts, or rehosts the course media and always preserves a link to the source.
>
> Python execution is limited to user-authored educational exercises. All user source code is fully visible and editable. Execution occurs locally in a Web Worker/WebAssembly environment and is terminated after 20 seconds. It has no access to native iOS APIs or user files.
>
> No account is required. The app contains no advertising, analytics, or tracking. Code, recognized text, notes, and progress remain on device and can be exported or deleted from Settings. Native functionality includes local study reminders, microphone dictation, haptic test feedback, durable local preferences, and system share/export. Microphone and speech permissions are requested only after Start Dictation; the app does not store audio. Recognition runs on device when supported and may use Apple's speech service on older systems.
>
> Review path: open the app → choose an Easy lesson → open Full Practice → run an included quick test → write a review note → use Share Notes. Optional course path: Course Notes → paste a BV / av URL → Load official player → Start Dictation → Stop and Save. A reviewer may test dictation without loading external media by speaking a short note into the microphone.

## Xcode and App Store Connect

1. Install Xcode 26 or newer and an iOS Simulator runtime.
2. Open `ios/App/App.xcodeproj` after running `npm run ios:sync`.
3. Select the developer team and confirm bundle ID `com.coocylh.tijiebu`.
4. Confirm iOS deployment target is 15.0 or newer.
5. Confirm `PrivacyInfo.xcprivacy` and the 1024×1024 icon are included in the App target.
6. Test offline launch, Python execution, notes persistence, deletion, reminders, sharing, microphone allow/deny, Chinese/English speech, interrupted dictation, external-player consent, dark/light system settings, iPad layout, and interrupted/backgrounded runs. Speech recognition must be tested on a physical iPhone.
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

## Course-content review note

The course feature is a user-selected external reference, not a downloader. Do not ship any Bilibili media, subtitles, creator artwork, or copied course text in the app bundle. Keep the source link, non-affiliation notice, click-to-load consent, and link-out fallback. Before App Store submission, confirm that embedding third-party course content is permitted for the intended release; otherwise disable the embedded player in the native build and retain only the external-link plus personal-dictation workflow.
