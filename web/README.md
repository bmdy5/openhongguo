# 私人放映 HTTP 服务

仅作为 Workbench `/watch` 的后端；前端独立发布，本服务不引入 Workbench 源码。Node 20+、ffmpeg 必须存在。SDK 固定使用发布的 `openhongguo@0.1.0`。

`npm ci && npm test` 后，由已授权秘密提供器在进程环境中注入 `WB_PERSONAL_USER` / `WB_PERSONAL_PASSWORD`，执行 `npm start`。不写 `.env`、不把凭据写进参数或日志。仅监听 `127.0.0.1:8014`，生产由同域 HTTPS 反代 `/api/hongguo/`，保持路径，不启用 proxy buffering/cache/temp file。生产不要设置 `HONGGUO_LOCAL_HTTP`。

个人账号先 `POST /api/hongguo/session`（Basic），获得 HttpOnly/Secure/SameSite=Strict cookie；搜索、目录、播放信息和视频都要求个人身份。匿名来源不代表本站接口公开。拒绝跨站请求，不为共享账单账号开放。

- `GET /api/hongguo/search?q=剧名`：首屏候选，仅公开元数据。
- `GET /api/hongguo/series/:id`：详情和目录；`has_more` 明确目录是否完整。
- `GET /api/hongguo/playback/:episode`：仅清晰度/编码/时长，不返回 CDN URL 或密钥。
- `GET /api/hongguo/stream/:episode?quality=best&start=120`：ffmpeg 管道流，源端定位，原编码复制，不保存视频正文。分辨率优先、同分辨率码率优先。

同一实例最多两路视频、8个待处理元数据请求，metadata 顺序访问来源；设备和播放元数据仅在内存，重启丢失。已签发播放模型按其到期时间减5秒复用，最长15分钟；未知到期时间时仅保留60秒。断连、20秒无数据、超时与退出均终止子进程。拒绝独立音轨或分段源，错误明确可见。

准备播放复用上游 [README「播放次数限制」](../README.md#播放次数限制) 与 `internal/cliapp/playback.go` 的已实现流程。仅 `resolvePlayback` 的 `ANONYMOUS_LIMITED` 会触发最多两次 SDK `resetDevice` 后重试；不会在搜索/目录、登录要求、验证码或真实 RATE_LIMITED 上这么做。登记与重试在同一个串行队列任务中执行，避免并发互相重置。上游维护者在 [Issue #2](https://github.com/beilunyang/openhongguo/issues/2) 也确认每台匿名设备通常只提供一次播放模型；SDK 本身把这一调用方责任留给客户端。

`GET/PUT /api/hongguo/history` 只保留最多40部剧的观看元数据（剧名、分集、时间位置、画质），原子写入 `HONGGUO_STATE_DIR/history.json`；默认是服务工作目录下的 `data/`，该目录禁止公开发布或提交。乱序到达的旧进度不覆盖新进度。重启前保留这个目录。

同域 Nginx 的精确新增 location：

```nginx
location ^~ /api/hongguo/ {
    proxy_pass http://127.0.0.1:8014;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_buffering off;
    proxy_request_buffering off;
    proxy_cache off;
    proxy_max_temp_file_size 0;
    proxy_read_timeout 90s;
    add_header Referrer-Policy no-referrer always;
}
```

不要改变原有 `/api/video/`、`/api/media/`、`/webdav/`。前端 `/watch` 由既有 SPA fallback 提供；无需改 DNS。部署前核对 ffmpeg 可执行路径（当前只读检查尚未发现），安装依赖后只新增 `hongguo-api` 这个 PM2 进程。先备份静态入口、受影响 Nginx 配置和已有进度元数据，再发布经过审查合并的明确版本。

浏览器采用自己的时间轴，跳到未缓冲位置时重新建流，不依赖不可定位的 pipe 的原生 seek。流的时间从0重新计时，网页加上请求起点。HEVC 支持取决于浏览器/系统，不能保证所有手机可播；不悄悄转码降画质。原始视频中的广告或水印不会移除。

本目录只做私人研究；上游接口、内容授权和匿名限制仍适用。部署前保存现有 Nginx 配置，`nginx -t` 通过后才 reload；回滚只撤本次精确 location 和进程，不触碰既有 video/media/WebDAV 服务。
