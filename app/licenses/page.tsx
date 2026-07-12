import type { Metadata } from "next";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "开源许可｜题解簿",
  description: "题解簿使用的主要开源组件和许可。",
};

const components = [
  ["Capacitor", "MIT License", "https://github.com/ionic-team/capacitor"],
  ["Pyodide", "Mozilla Public License 2.0", "https://github.com/pyodide/pyodide"],
  ["CPython", "Python Software Foundation License", "https://docs.python.org/3/license.html"],
  ["React", "MIT License", "https://github.com/facebook/react"],
] as const;

export default function LicensesPage() {
  return (
    <main className="legal-shell">
      <article className="legal-paper">
        <a className="legal-back" href="../">← 返回题解簿</a>
        <div className="section-kicker">ACKNOWLEDGEMENTS</div>
        <h1>开源许可</h1>
        <p className="legal-lead">感谢这些开源项目帮助题解簿在设备本地提供学习、存储和 Python 运行能力。</p>
        <div className="license-list">
          {components.map(([name, license, url]) => (
            <a key={name} href={url} target="_blank" rel="noreferrer">
              <strong>{name}</strong>
              <span>{license}</span>
              <b aria-hidden="true">↗</b>
            </a>
          ))}
        </div>
        <p className="legal-fineprint">各组件的版权归相应作者与贡献者所有。应用未修改 Pyodide 运行时；固定版本随 iOS 安装包分发，不从远程下载可执行组件。</p>
        <nav className="legal-links" aria-label="相关信息">
          <a href="../privacy/">隐私政策</a>
          <a href="../support/">帮助与联系</a>
        </nav>
      </article>
    </main>
  );
}
