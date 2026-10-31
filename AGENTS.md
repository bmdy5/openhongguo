# Personal fork: private Workbench playback

上游SDK保持原样；个人HTTP适配器在 `web/`，单独依赖、测试和发布。前端位于个人基础设施 Workbench，只通过 `/api/hongguo` HTTP通信，不互相import源码。任何修改使用独立worktree。

用户流程：先向小萤描述想看的类型，小萤查询元数据并介绍候选，用户确认后提供 `https://plan.xiaoliang.tech/watch?series=ID&episode=N`。不把简介当作已观看的剧情，不凭题材标签编造质量评价。不自动开始播放或批量采集。

部署后可使用 `node web/scripts/catalog.mjs search <关键词>` 和 `info <series-id>` 查询元数据；既有个人工作台身份仅由已授权秘密提供器注入 `WB_PERSONAL_USER` / `WB_PERSONAL_PASSWORD`。不读 `.env`，不在参数/输出里放密码。该命令只联系固定可信的个人站点，不输出CDN地址或密钥。

运行与边界见 `web/README.md`。媒体只通过pipe，观看进度仅保存元数据。保持匿名来源限制，不绕过平台登录、付费或验证码，不自动更换设备来规避限制。上游提供的本地播放能力不代表获得内容再分发授权。

检查：`cd web && npm ci && npm test`；改SDK源码另行执行上游Go测试。发布前备份进度文件和本次受影响的Nginx配置，工作目录必须稳定，不把worktree路径写进长期服务。
