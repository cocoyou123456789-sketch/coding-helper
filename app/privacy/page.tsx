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
        <p className="legal-lead">题解簿以本地学习为核心。你写下的代码、课程听写、笔记和进度默认只保存在自己的设备上。</p>
        <p className="legal-date">生效日期：2026 年 7 月 13 日</p>

        <section>
          <h2>我们不会收集什么</h2>
          <p>iOS App 不要求注册账号，不包含广告、行为分析或跨 App 追踪。我们不会把你的代码、课程链接、识别文字、笔记、答题进度或提醒时间上传到我们的服务器。</p>
        </section>

        <section>
          <h2>设备本地数据</h2>
          <p>代码、逐行解释、复盘、课程链接、识别后的文字、课程笔记、学习进度、显示语言、字号和提醒设置保存在设备的应用容器中，用于恢复你的学习状态。Python 代码和随 App 安装的测试在设备本地运行。</p>
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
          <p>只有在你点击“分享笔记”后，系统分享菜单才会接收你选择分享的文字。课程笔记中的 Bilibili 官方外链播放器只有在你主动点击加载后才会连接 Bilibili；届时 Bilibili 可能接收网络和设备信息，并适用其<a href="https://www.bilibili.com/blackboard/privacy-policy.html" target="_blank" rel="noreferrer">隐私政策</a>。其他外部页面由系统浏览器打开，并适用相应网站自己的隐私规则。</p>
        </section>

        <section>
          <h2>删除数据</h2>
          <p>你可以在 App 的“学习提醒”设置中选择“删除本机学习数据”，立即清除代码、课程链接、听写文字、笔记、进度和提醒。卸载 App 也会移除保存在应用容器中的数据。</p>
        </section>

        <section>
          <h2>联系我们</h2>
          <p>如果你对隐私或数据处理有疑问，请通过 <a href="https://github.com/cocoyou123456789-sketch/coding-helper/issues" target="_blank" rel="noreferrer">GitHub 支持页面</a>联系我们。</p>
        </section>

        <div className="legal-english" lang="en">
          <h2>English summary</h2>
          <p>The iOS app requires no account and contains no ads, analytics, or tracking. Code, course links, recognized text, notes, progress, preferences, and reminder settings stay on your device. Microphone access begins only after you start dictation; audio is never stored by the app, although Apple or a browser speech service may process it when on-device recognition is unavailable. The Bilibili player connects only after you choose to load it. You can export notes through an explicit share action and erase local study data from Settings.</p>
        </div>
      </article>
    </main>
  );
}
