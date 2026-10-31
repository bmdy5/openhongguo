# Personal fork: private Workbench playback

上游SDK保持原样；个人HTTP适配器在 `web/`，单独依赖、测试和发布。前端位于个人基础设施 Workbench，只通过 `/api/hongguo` HTTP通信，不互相import源码。任何修改使用独立worktree。

用户流程：先向小萤描述想看的类型，小萤查询元数据并介绍候选，用户确认后提供 `https://plan.xiaoliang.tech/watch?series=ID&episode=N`。不把简介当作已观看的剧情，不凭题材标签编造质量评价。不自动开始播放或批量采集。

部署后可使用 `node web/scripts/catalog.mjs search <关键词>` 和 `info <series-id>` 查询元数据；既有个人工作台身份仅由已授权秘密提供器注入 `WB_PERSONAL_USER` / `WB_PERSONAL_PASSWORD`。不读 `.env`，不在参数/输出里放密码。该命令只联系固定可信的个人站点，不输出CDN地址或密钥。

运行与边界见 `web/README.md`。媒体只通过pipe，观看进度仅保存元数据。准备播放遵循上游 README「播放次数限制」和 CLI 的现有流程：仅播放模型返回 ANONYMOUS_LIMITED 时，最多调用两次 SDK resetDevice 后重试；整个过程在元数据队列内串行，不无限轮换。登录、付费、验证码和实际限流错误保持失败，不用刷新设备重试；搜索和目录也不因此刷新设备。上游提供的本地播放能力不代表获得内容再分发授权。

检查：`cd web && npm ci && npm test`；改SDK源码另行执行上游Go测试。发布前备份进度文件和本次受影响的Nginx配置，工作目录必须稳定，不把worktree路径写进长期服务。
