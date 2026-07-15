import type { Metadata } from "next";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "隐私政策｜题解簿",
  description: "题解簿 iOS App 的隐私政策。",
};

export default function PrivacyPage() {
  return (
    <main className="legal-shell">
      <article className="legal-paper">
        <a className="legal-back" href="../">← 返回题解簿</a>
        <div className="section-kicker">PRIVACY</div>
        <h1>隐私政策</h1>
        <p className="legal-lead">题解簿以本地学习为核心。你写下的代码、错题本、课程听写、文字与图片笔记和进度默认只保存在自己的设备上。</p>
        <p className="legal-date">生效日期：2026 年 7 月 15 日</p>

        <section>
          <h2>我们不会收集什么</h2>
          <p>iOS App 不要求注册账号，不包含广告、行为分析或跨 App 追踪。我们不会把你的代码、错题本、课程链接、识别文字、文字或图片笔记、答题进度或提醒时间上传到我们的服务器。</p>
        </section>

        <section>
          <h2>设备本地数据</h2>
          <p>代码、逐行解释、复盘、错题本、题目图片笔记、课程链接、识别后的文字、课程笔记、学习进度、显示语言、字号和提醒设置保存在设备的应用容器中，用于恢复你的学习状态。Python 代码和随 App 安装的测试在设备本地运行。</p>
        </section>

        <section>
          <h2>错题本和来源链接</h2>
          <p>错题本保存你主动输入的题目摘要、自己的答案、参考答案、逐行差异和复盘内容。导入时填写的来源链接只作为本机书签保存；题解簿不会自动抓取链接内容，也不会把错题本上传到服务器。逐行对比在当前设备上完成，不会把代码发送给 AI 服务。</p>
        </section>

        <section>
          <h2>相册、相机和图片笔记</h2>
          <p>只有在你主动为题目添加图片笔记时，App 才会让你选择照片；只有在你进一步选择拍照时才会使用相机。选中的图片会作为该题的学习笔记保存在当前设备，不会上传到题解簿服务器。你可以在图片笔记中单独删除图片，也可以通过“删除本机学习数据”一并清除。</p>
        </section>

        <section>
          <h2>麦克风和语音识别</h2>
          <p>只有在你点击“开始听写”后，App 才会请求麦克风和语音识别权限。识别支持时优先在设备上完成；在部分 iOS 版本或网页浏览器中，音频可能由 Apple 或浏览器提供商的语音服务处理，并适用该服务的隐私规则。题解簿不会保存录音，也不会把音频发送到题解簿服务器，只会把识别后的可编辑文字保存在当前设备。你可以随时停止听写或删除文字。</p>
        </section>

        <section>
          <h2>通知</h2>
          <p>只有当你主动打开“每天提醒我学习”时，App 才会请求通知权限。提醒由 iPhone 本地安排，不需要把提醒数据发送到服务器。你可以随时在 App 或 iPhone 设置中关闭通知。</p>
        </section>

        <section>
          <h2>分享和外部链接</h2>
          <p>只有在你点击“分享笔记”或“导出备份”后，下载功能或系统分享菜单才会接收相应内容。完整备份是可阅读的 JSON 明文文件，会包含错题本和图片笔记，也可能包含代码、课程链接、听写文字、其他笔记、进度和偏好；文件只会保存到你主动选择的位置，题解簿不会上传它。若你把文件交给云盘或其他 App，后续处理适用该服务的隐私规则。课程笔记中的 Bilibili 官方外链播放器只有在你主动点击加载后才会连接 Bilibili；届时 Bilibili 可能接收网络和设备信息，并适用其<a href="https://www.bilibili.com/blackboard/privacy-policy.html" target="_blank" rel="noreferrer">隐私政策</a>。其他外部页面由系统浏览器打开，并适用相应网站自己的隐私规则。</p>
        </section>

        <section>
          <h2>删除数据</h2>
          <p>你可以在“设置”中选择“删除本机学习数据”，清除代码、错题本、课程链接、听写文字、文字与图片笔记、进度和提醒设置。卸载 App 也会移除保存在应用容器中的数据。</p>
        </section>

        <section>
          <h2>联系我们</h2>
          <p>如果你对隐私或数据处理有疑问，请通过 <a href="https://github.com/cocoyou123456789-sketch/coding-helper/issues" target="_blank" rel="noreferrer">GitHub 支持页面</a>联系我们。</p>
        </section>

        <div className="legal-english" lang="en">
          <h2>English summary</h2>
          <p>The iOS app requires no account and contains no ads, analytics, or tracking. Code, mistake-book entries, course links, recognized text, text and image notes, progress, preferences, and reminder settings stay on your device. Source URLs in the mistake book are bookmarks only; the app does not scrape them, and deterministic code comparison runs locally without sending answers to an AI service. Photo Library access is used only after you choose to add an image note, and Camera access is used only if you then choose to take a photo. Images are not uploaded to Tijiebu. Microphone access begins only after you start dictation; audio is never stored by the app, although Apple or a browser speech service may process it when on-device recognition is unavailable. The Bilibili player connects only after you choose to load it. Full backups are readable JSON files that include the mistake book and image notes, are created only after an explicit export action, and are sent only to the location or app you choose. Erasing local study data from Settings also removes mistake-book entries and image notes.</p>
        </div>
      </article>
    </main>
  );
}
