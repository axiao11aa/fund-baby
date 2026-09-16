# 养基小宝-实时基金估值 (bund-baby)

**在线预览地址：[https://fund-baby.ningzhengsheng.cn/](https://fund-baby.ningzhengsheng.cn/)**
> 由于某些平台不能在实时看见基金的估值，所以做了一个基金估值的网站。

![alt text](app/assets/fund-baby-img1.png)
![alt text](app/assets/fund-baby-img2.png)


## 📖 使用说明

1. **添加基金**：在顶部输入框输入 6 位基金代码（如 `110022`），点击“添加”。
2. **查看详情**：卡片将展示实时估值及前 10 重仓股的占比与今日涨跌。
3. **调整频率**：点击右上角“设置”图标，可调整自动刷新的间隔时间。
4. **删除基金**：点击卡片右上角的红色删除图标即可移除。


## ✨ 特性

- **实时估值**：通过输入基金编号，实时获取并展示基金的单位净值、估值净值及实时涨跌幅。
- **重仓追踪**：自动获取基金前 10 大重仓股票，并实时追踪重仓股的盘中涨跌情况。支持收起/展开展示。
- **纯前端运行**：通过支持 CORS 的估值接口及 JSONP / Script 数据源直连东方财富、腾讯财经，无需新增后端。
- **本地持久化**：使用 `localStorage` 存储已添加的基金列表及配置信息，刷新不丢失。
- **响应式设计**：完美适配 PC 与移动端。针对移动端优化了文字展示、间距及交互体验。
- **自选功能**：支持将基金添加至“自选”列表，通过 Tab 切换展示全部基金或仅自选基金。自选状态支持持久化及同步清理。
- **可自定义频率**：支持设置自动刷新间隔（5秒 - 300秒），并提供手动刷新按钮。


## 🛠 技术栈

> 一个基于 Next.js 开发的纯前端基金估值与重仓股实时追踪工具。采用玻璃拟态设计（Glassmorphism），支持移动端适配，且无需后端服务器即可运行。

- **框架**：[Next.js官网](https://nextjs.org/) , [Next.js入门指南：从零构建现代Web应用](https://ningzhengsheng.cn/2026/02/10/Nextjs%E7%BD%91%E9%A1%B5%E5%BC%80%E5%8F%91%E5%85%A5%E9%97%A8%E6%8C%87%E5%8D%97/)
- **样式**：原生 CSS (Global CSS) + 玻璃拟态设计
- **数据源**：
  - 基金估值：天天基金 `FundValuationLast`（JSON / CORS）
  - 已公布净值：腾讯财经（独立获取，估值失败时自动降级）
  - 重仓数据：东方财富 (HTML Parsing)
  - 股票行情：腾讯财经 (Script Tag Injection)
- **部署**：GitHub Actions + GitHub Pages

### 数据可用性与验证

- 所有行情请求均有 6 秒超时；某只基金失败后继续刷新其他基金，保留旧数据并提示更新失败。
- 估值为空时显示已公布净值及日期，不把缺失涨跌幅当作 0%；过期估值不用于当日收益计算。
- 重仓披露和历史净值请求独立失败，正常报价仍可显示；共用全局变量的脚本串行读取，避免基金之间串数据。
- 腾讯原分时估值接口已下线，新估值接口仅提供最新点，目前不显示分时曲线。历史净值曲线仍保留。
- 这些公开数据端点没有本项目可依赖的服务可用性保证，覆盖范围可能变化，估值不等于最终公布净值。
- `npm test` 运行数据归一化、备用源、超时清理、并发隔离和收益计算回归测试；`npm run build` 验证生产构建。


## 🚀 快速开始

### 本地开发

1. 克隆仓库：
   ```bash
   git clone https://github.com/zhengshengning/fund-baby.git
   cd fund-baby
   ```

2. 安装依赖：
   ```bash
   npm install
   ```

3. （可选）配置环境变量（下面有配置说明）：
   ```bash
   cp env.example .env.local
   ```
   按照 `env.example` 填入以下值：
   - `NEXT_PUBLIC_WEB3FORMS_ACCESS_KEY`：Web3Forms Access Key

   注：只有可选的反馈功能需要配置，不影响基金和备份功能。

4. 运行开发服务器：
   ```bash
   npm run dev
   ```
   访问 [http://localhost:3000](http://localhost:3000) 查看效果。

### 本地数据与 JSON 备份

本版本不使用邮箱登录或云同步，也不需要 Supabase。原公告已移除。

右上角“设置”提供“导出 JSON”和“导入 JSON”。备份包含基金、持仓、自选、分组、待处理交易、刷新频率和显示模式；不包含账号凭证。行情缓存会在导入后重新获取。

导入前会校验文件并显示摘要，支持旧版配置文件。默认合并，保留本地设置；持仓或待处理交易冲突可选择保留本地或使用文件。覆盖恢复需明确勾选确认，并可先导出当前数据。校验完成前不写入，写入失败时回滚。

数据只保存在当前浏览器。清理站点数据会丢失本地记录，请定期备份。导入旧备份前请核对待处理交易，避免重复记账。

### 构建与Github部署

本项目已配置 GitHub Actions，可以直接部署在github上。
（操作：Settings → Pages → Build and deployment → Source选择github Actions）。
每次推送到 `main` 分支时，会自动执行构建并部署到 GitHub Pages。
无需配置登录服务；仅反馈功能可选配置 Web3Forms 密钥。

若要手动构建：
```bash
npm run build
```
静态文件将生成在 `out` 目录下。

### Docker运行

1. 构建镜像
```
docker build -t fund-baby .
```

2. 启动容器
```
docker run -d -p 3000:3000 --name fund fund-baby
```

#### docker-compose
```
docker compose up -d
```


## 📝 免责声明

本项目所有数据均来自公开接口，仅供个人学习及参考使用。数据可能存在延迟，不作为任何投资建议。


## 📄 开源协议 (License)

本项目采用 **[GNU Affero General Public License v3.0](https://www.gnu.org/licenses/agpl-3.0.html)**（AGPL-3.0）开源协议。

- **允许**：自由使用、修改、分发本软件；若你通过网络服务向用户提供基于本项目的修改版本，须向该服务的用户提供对应源代码。
- **要求**：基于本项目衍生或修改的作品需以相同协议开源，并保留版权声明与协议全文。
- **无担保**：软件按「原样」提供，不提供任何明示或暗示的担保。

完整协议文本见仓库根目录 [LICENSE](./LICENSE) 文件，或 [GNU AGPL v3 官方说明](https://www.gnu.org/licenses/agpl-3.0.html)。


---
## 💬 联系
Github主页：[https://github.com/zhengshengning](https://github.com/zhengshengning)

个人博客：[https://ningzhengsheng.cn](https://ningzhengsheng.cn)
