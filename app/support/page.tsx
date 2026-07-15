import type { Metadata } from "next";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "帮助与联系｜题解簿",
  description: "题解簿 iOS App 使用帮助和联系入口。",
};

export default function SupportPage() {
  return (
    <main className="legal-shell">
      <article className="legal-paper">
        <a className="legal-back" href="../">← 返回题解簿</a>
        <div className="section-kicker">SUPPORT</div>
        <h1>帮助与联系</h1>
        <p className="legal-lead">第一次使用时，按“选难度 → 做小课 → 练完整题 → 写复盘”即可开始。</p>

        <section>
          <h2>代码无法运行</h2>
          <p>先检查 Python 缩进和是否存在不会结束的循环。App 会在运行时间过长时自动停止本次测试。关闭并重新打开题目不会删除已经保存的笔记。</p>
        </section>

        <section>
          <h2>找不到笔记或进度</h2>
          <p>学习数据只保存在当前设备，不会自动同步。删除、卸载或换机前，请在“设置 → 完整备份”导出 JSON 文件；完整备份会包含错题本和图片笔记，在另一台设备上选择“从文件恢复”即可带回代码、逐行解释、复盘、错题、文字与图片笔记、课程听写、进度和偏好。恢复会完整替换本机数据，不会合并，学习提醒也会保持关闭。</p>
        </section>

        <section>
          <h2>如何导入错题并对比答案</h2>
          <p>打开顶部“错题本”，可以一键加入当前练习，也可以选择“导入一道题”，粘贴题名、自己的答案和你确认过的参考答案。逐行对比会显示共同代码、“仅我的”和“仅参考”内容，并计算只忽略行末多余空格的行相似度；Python 缩进和字符串里的空格仍会视为真实差异。它不是 AI，不会替你判断算法一定正确。请结合差异填写真正的错误原因和“下次看到什么信号要想到什么”。来源链接只作为书签保存，题解簿不会自动抓取网页内容。</p>
        </section>

        <section>
          <h2>如何添加或删除图片笔记</h2>
          <p>打开一道题，在笔记区切换到“图片”后选择“添加图片”。iPhone 会让你从照片图库选择，或在可用时选择拍照；题解簿只会在你主动操作后请求相应权限。添加后的图片只保存在当前设备，完整备份会包含它们。你可以单独删除一张图片；“设置 → 删除本机学习数据”会清除全部图片笔记。</p>
        </section>

        <section>
          <h2>备份文件无法恢复</h2>
          <p>请选择题解簿导出的原始 JSON 文件，不要修改扩展名或文件内容。为了避免页面卡住，当前版本只接受 24 MB 以内的备份；图片或错题内容较多时，文件也会更大。恢复前会显示备份时间、题目数、错题数、图片数、课程数和 XP；在你确认替换前，本机数据不会改变。</p>
        </section>

        <section>
          <h2>提醒没有出现</h2>
          <p>请在 App 中重新保存提醒时间，并前往“iPhone 设置 → 通知 → 题解簿”确认通知权限已经打开。</p>
        </section>

        <section>
          <h2>课程链接或播放器无法打开</h2>
          <p>请粘贴 bilibili.com 的完整视频网址或 BV / av 号。若手里是 b23.tv 短链接，先在浏览器打开它，再复制地址栏中的完整网址。部分登录、地区或作者限制的课程可能无法在外链播放器中播放，此时请使用“在 Bilibili 打开”。</p>
        </section>

        <section>
          <h2>语音听写没有文字</h2>
          <p>请在 iPhone 设置或浏览器站点设置中允许麦克风与语音识别。网页端建议使用最新版 Chrome 或 Edge；Safari 还需要系统的 Siri / 听写功能可用。戴耳机时麦克风无法直接读取播放器声音，最稳定的用法是暂停课程后，用自己的话口述要点。较长课程可分段停止并保存，已经识别的文字不会因为重新开始而清空。</p>
        </section>

        <section>
          <h2>报告问题或提出建议</h2>
          <p>请在 <a href="https://github.com/cocoyou123456789-sketch/coding-helper/issues" target="_blank" rel="noreferrer">GitHub Issues</a> 新建一条反馈，并写明你的 iPhone 型号、iOS 版本、题目名称以及出现问题前的操作。</p>
        </section>

        <nav className="legal-links" aria-label="相关信息">
          <a href="../privacy/">隐私政策</a>
          <a href="../licenses/">开源许可</a>
        </nav>
      </article>
    </main>
  );
}
