import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const file = (path) => new URL(`../${path}`, import.meta.url);

test("the practice workspace uses a real Python editor and familiar IDE controls", async () => {
  const [page, editor, styles] = await Promise.all([
    readFile(file("app/page.tsx"), "utf8"),
    readFile(file("app/leetcode-code-editor.tsx"), "utf8"),
    readFile(file("app/practice-ide.module.css"), "utf8"),
  ]);

  assert.match(page, /LeetCodeCodeEditor/);
  assert.match(page, /lazy\(loadCodeEditor\)/);
  assert.match(page, /lazy\(loadCourseNotes\)/);
  assert.match(page, /<Suspense/);
  assert.match(page, /去 LeetCode 提交/);
  assert.match(page, /setShowProblemList/);
  assert.match(page, /setShowNotesDrawer/);
  assert.match(page, /messageBelongsToRun/);
  assert.match(page, /activeRunRef/);
  assert.match(page, /cancelActiveRun/);
  assert.match(page, /noteLineMode/);
  assert.match(page, /noteLineIndexes/);
  assert.match(page, /onCursorLineChange/);
  assert.match(page, /selectMobileWorkspacePane/);
  assert.match(page, /handleTabListKeyDown/);
  assert.match(page, /parseNavigationState/);
  assert.match(page, /window\.history\.pushState/);
  assert.match(page, /window\.history\.replaceState/);
  assert.match(page, /addEventListener\("popstate"/);
  assert.match(page, /hydrated && !studyEditingBlocked/);
  assert.doesNotMatch(page, /inert=\{!hydrated\}/);
  assert.match(page, /正在恢复这台设备上的学习记录/);
  assert.match(page, /tabIndex=\{mobileWorkspaceTab === "code" \? 0 : -1\}/);
  assert.match(page, /aria-labelledby="mobile-code-tab"/);
  assert.match(page, /starterPlaceholderLine/);
  assert.match(page, /pythonSourceIsEmpty/);
  assert.match(page, /setSourceIssue\("empty"\)/);
  assert.match(page, /restoreStarterCode\(emptyRecoveryNeedsConfirmation, true\)/);
  assert.match(page, /describeFirstMismatch/);
  assert.match(page, /pythonErrorSummary/);
  assert.match(page, /normalizeSignatureIssue/);
  assert.match(page, /python-worker-signature-v1\.js/);
  assert.match(page, /signature: currentProblem\.signature/);
  assert.match(page, /signatureIssue\?: PythonSignatureIssue/);
  assert.match(page, /copy\.signatureTitle/);
  assert.match(page, /signatureIssue\.declaration/);
  assert.match(page, /copy\.backToSignatureCode/);
  assert.match(page, /copy\.checkSignatureClass\(signatureIssue\.focusLine\)/);
  assert.match(page, /copy\.checkSignatureLine\(signatureIssue\.focusLine\)/);
  assert.match(page, /saveFailedTestToReview/);
  assert.match(page, /onClick=\{\(\) => runTests\(\)\}/);
  assert.match(page, /onRun=\{\(\) => runTests\(\)\}/);
  assert.match(page, /runTests\(\{ allowPlaceholder: true \}\)/);
  assert.match(page, /testConsoleRef\.current\?\.scrollIntoView/);
  assert.match(page, /runStatusRef\.current\?\.focus\(\{ preventScroll: true \}\)/);
  assert.match(page, /problemHeadingRef\.current\?\.focus/);
  assert.match(page, /revealLine\(nextLine, \{ focus: false \}\)/);
  assert.match(page, /revealLine\(safeActiveCodeLine, \{ focus: false \}\)/);
  assert.match(page, /aria-controls=\{`starter-core-idea-/);
  assert.match(page, /aria-controls=\{`wrong-core-idea-/);
  assert.match(page, /lineNotes: \[\]/);
  assert.match(page, /markCurrentProblemSolved/);
  assert.match(page, /practiceCompletionProgress/);
  assert.match(page, /recommendedPracticeProblemId/);
  assert.match(page, /completionProgress\.notesReady/);
  assert.match(page, /className=\{ideStyles\.completionPrimary\}/);
  assert.match(page, /copy\.confirmAccepted/);
  assert.match(page, /copy\.nextRecommended/);
  assert.match(page, /openNextPracticeProblem/);
  assert.match(page, /noteSaveLabel/);
  assert.match(page, /role=\{noteSaveIsError \? "alert" : undefined\}/);
  assert.match(page, /function updateRecord\([\s\S]*?markStudyDirty\(\);[\s\S]*?setRecords/);
  assert.match(page, /function updateEditorCode\([\s\S]*?markStudyDirty\(\);[\s\S]*?setStarterPromptLine/);
  assert.match(page, /if \(!changesRecord\) return/);
  assert.match(page, /if \(previousStatus === requestedStatus\) return/);
  assert.match(page, /if \(!allQuickTestsPassed \|\| !completionProgress\.notesReady \|\| currentRecord\.status === "solved"\) return/);
  assert.match(page, /status === "solved" && currentRecord\.status !== "solved"/);
  assert.match(page, /updateCurrentPracticeStatus\(status\)/);
  assert.match(page, /studyHomeRef\.current\?\.focus/);
  assert.match(page, /focusMobileWorkspaceHeading\(notesHeadingRef\)/);
  assert.match(page, /showCodeFromNotes/);
  assert.match(page, /data-line-index=\{index\}/);
  assert.match(page, /PRACTICE_STATUS_FILTERS/);
  assert.match(page, /practiceStatusAfterActivity/);
  assert.match(page, /recommendedPracticeProblemId/);
  assert.match(page, /const completionRecommendationScope = continuationScopeProblems\.filter/);
  assert.match(page, /aria-pressed=\{statusFilter === status\}/);
  assert.match(page, /aria-live="polite" aria-atomic="true"/);
  assert.match(page, /openRecommendedPractice/);
  assert.match(page, /function openOfficialProblemPage\(\)[\s\S]*?openExternalPage\(officialProblemUrl\)/);
  assert.match(page, /onClick=\{openOfficialProblemPage\}/);
  assert.match(page, /updateRecord\(\{ code: currentProblem\.starterCode, lineNotes: \[\] \}\)/);
  assert.doesNotMatch(page, /if \(allPassed\) updateRecord\(\{ status: "solved" \}\)/);
  assert.doesNotMatch(page, /code: currentProblem\.starterCode, lineNotes: \[\], status: "todo"/);
  assert.doesNotMatch(page, /autosave-badge">\{copy\.saved\}/);
  assert.doesNotMatch(page, /onClick=\{\(\) => updateRecord\(\{ status \}\)\}/);
  assert.doesNotMatch(page, /className="code-field"/);
  assert.match(page, /kind: "code" \| "timeout" \| "runtime"/);
  assert.match(page, /runState\.kind === "code"/);
  assert.match(page, /runState\.kind === "runtime"/);
  assert.match(page, /runState\.kind === "timeout"/);
  assert.match(page, /kind === "runtime" \? copy\.runtimeTimeout : copy\.timeout/);
  assert.match(page, /copy\.runtimeFailureTitle/);
  assert.match(page, /function retryTests\(\)[\s\S]*?runStatusRef\.current\?\.focus/);
  assert.match(page, /onClick=\{retryTests\}>\{copy\.retryRun\}/);
  assert.match(page, /runtimeCoach}[\s\S]*?focusCodeLine\(safeActiveCodeLine\)[\s\S]*?copy\.backToEditor/);
  assert.match(page, /focusCodeLine\(signatureIssue\?\.focusLine \?\? runErrorLine \?\? safeActiveCodeLine\)/);
  assert.match(page, /wrongAnswerCoach}[\s\S]*?focusCodeLine\(safeActiveCodeLine\)[\s\S]*?copy\.backToEditor/);
  assert.match(page, /ref=\{runStatusRef\}[\s\S]*?tabIndex=\{-1\}/);

  assert.match(editor, /EditorView/);
  assert.match(editor, /python\(\)/);
  assert.match(editor, /pythonLanguage\.data\.of/);
  assert.match(editor, /snippetCompletion/);
  assert.match(editor, /Mod-Enter/);
  assert.match(editor, /indentWithTab/);
  assert.match(editor, /onCursorLineChangeRef/);
  assert.match(editor, /update\.selectionSet/);
  assert.match(editor, /options\?\.focus !== false/);
  assert.match(editor, /"&\.cm-focused"[\s\S]*?boxShadow: "inset 0 0 0 2px #f2a1b9"/);

  assert.match(styles, /grid-template-columns: minmax\(330px, 42%\)/);
  assert.match(styles, /\.notesDrawer/);
  assert.match(styles, /--ide-caption: max\(12px/);
  assert.match(styles, /\.errorCoach/);
  assert.match(styles, /\.signatureCoach/);
  assert.match(styles, /\.signatureDeclaration/);
  assert.match(styles, /white-space: pre-wrap/);
  assert.match(styles, /\.emptySourceCoach/);
  assert.match(styles, /\.wrongAnswerCoach/);
  assert.match(styles, /\.runtimeCoach/);
  assert.match(styles, /\.timeoutCoach/);
  assert.match(styles, /\.consoleStatusFocus:focus/);
  assert.match(styles, /\.methodDisclosure/);
  assert.match(styles, /scroll-margin-top: calc\(64px \+ env\(safe-area-inset-top\)\)/);
  assert.match(styles, /\.lineNoteNavigator/);
  assert.match(styles, /\.navigatorActive/);
  assert.match(styles, /\.completionGuide/);
  assert.match(styles, /\.completionSuccess/);
  assert.match(styles, /\.noteSaveError/);
  assert.match(styles, /\.libraryStatusFilters/);
  assert.match(styles, /\.libraryContinueCard/);
  assert.match(styles, /\.libraryEmpty/);
  assert.match(styles, /\.editorLoading/);
  assert.match(styles, /@media \(max-width: 760px\)/);
  assert.match(styles, /\.editorToolbar \{[\s\S]*?position: sticky;[\s\S]*?env\(safe-area-inset-top\)/);
  assert.match(styles, /\.testConsole \{[\s\S]*?scroll-margin-top: calc\(180px \+ env\(safe-area-inset-top\)\)/);
});

test("image notes and the mistake book are reachable, local, and mobile friendly", async () => {
  const [page, imagePanel, imageStyles, mistakePanel, mistakeStyles] = await Promise.all([
    readFile(file("app/page.tsx"), "utf8"),
    readFile(file("app/note-image-panel.tsx"), "utf8"),
    readFile(file("app/note-image-panel.module.css"), "utf8"),
    readFile(file("app/mistake-book-panel.tsx"), "utf8"),
    readFile(file("app/mistake-book-panel.module.css"), "utf8"),
  ]);

  assert.match(page, /lazy\(loadNoteImagePanel\)/);
  assert.match(page, /id="image-notes-tab"/);
  assert.match(page, /queueNoteImageStoreMutation/);
  assert.match(page, /lazy\(loadMistakeBookPanel\)/);
  assert.match(page, /copy\.mistakeBook/);
  assert.match(page, /currentProblem=\{currentMistakeSeed\}/);
  assert.match(page, /queueMistakeBookStoreMutation/);
  assert.match(page, /saveFailedTestToMistakeBook/);
  assert.match(page, /selectionRequest=\{mistakeBookSelectionRequest\}/);
  assert.match(page, /setMistakeBookSelectionRequest\(\{/);
  assert.match(page, /mistakeBookMounted &&/);
  assert.match(page, /hidden=\{!showMistakeBook\}/);
  assert.match(page, /setMistakeBookMounted\(true\)/);
  assert.match(imagePanel, /type="file"/);
  assert.doesNotMatch(imagePanel, /capture=/);
  assert.match(imagePanel, /role="dialog"/);
  assert.match(imagePanel, /maxLength=\{MAX_NOTE_IMAGE_CAPTION_LENGTH\}/);
  assert.match(imagePanel, /window\.setTimeout\(\(\) => \{ void saveCaption\(\); \}, 400\)/);
  assert.match(imagePanel, /addEventListener\("pagehide"/);
  assert.match(imagePanel, /addEventListener\("visibilitychange"/);
  assert.match(imagePanel, /NOTE_IMAGE_CAPTION_DRAFTS_STORAGE_KEY/);
  assert.match(imagePanel, /baseCaption/);
  assert.match(imagePanel, /pending\.baseCaption === image\.caption/);
  assert.match(imagePanel, /text\.draftConflict/);
  assert.match(imagePanel, /discardCaptionDraft\(image\.id\)/);
  assert.match(page, /NOTE_IMAGE_CAPTION_DRAFTS_STORAGE_KEY/);
  assert.match(imagePanel, /void saveCaptionRef\.current\(\)/);
  assert.match(imageStyles, /min-height: 44px/);
  assert.match(imageStyles, /@media \(max-width:/);
  assert.match(imageStyles, /\.draftConflict button \{[\s\S]*?min-height: 44px/);
  assert.match(mistakePanel, /导入其他题/);
  assert.match(mistakePanel, /逐行对比/);
  assert.match(mistakePanel, /它不是 AI/);
  assert.match(mistakePanel, /先看右侧标出的/);
  assert.match(mistakePanel, /onSave\(entry: MistakeEntry\): Promise<void>/);
  assert.match(mistakeStyles, /@media \(max-width:/);
  assert.match(mistakeStyles, /min-height: 44px/);
});
