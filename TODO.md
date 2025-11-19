# TODO List - MultiMediaSaver

本文档列出了 MultiMediaSaver 项目中尚未完成的功能和任务。

## 第一阶段（快速上线必做）

### 1. "Download all" 按钮（UI 占位）
- **状态**: ✅ 已完成
- **优先级**: 高
- **描述**: 在成功展示媒体文件的区域添加"Download all"按钮
- **要求**: 
  - 第一版可仅在 UI 上占位，后续再实现打包 ZIP 功能
  - 位置：`app/page.tsx` 成功状态展示区域，在媒体网格上方
- **文件**: `app/page.tsx`

### 2. 单元测试
- **状态**: ✅ 已完成
- **优先级**: 高
- **描述**: 编写基础单元测试，确保核心功能正常工作
- **需要测试的功能**:
  - [x] `detectProvider`：不同 URL 的识别结果
    - 测试 Twitter URL (`twitter.com`, `x.com`)
    - 测试 Instagram URL (`instagram.com`)
    - 测试不支持的 URL
    - 测试边界情况（空字符串、无效格式等）
  - [x] `saveMedia`：文件名生成规则与目录创建逻辑
    - 测试文件扩展名推断（根据 contentType）
    - 测试 UUID + 时间戳文件名生成
    - 测试目录自动创建
    - 测试文件大小限制（500MB）
    - 使用 mock fs 进行测试
- **文件**: 
  - `lib/media/__tests__/detector.test.ts`
  - `lib/fs/__tests__/saveMedia.test.ts`

## 第二阶段（功能扩展）

### 3. Instagram Provider 完整实现
- **状态**: ✅ 已完成
- **优先级**: 中
- **描述**: 通过自研 `instagramPlaywright` 爬虫抓取帖子中的图片/视频，并复用 `saveMedia` 保存至 `public/downloads`
- **亮点**:
  - Playwright 移动端仿真 + 轮播滑动脚本，确保抓取多图/多段视频
  - 内置二次下载逻辑，带上 IG 所需 UA/Referer 规避 403
  - 与 Twitter provider 相同的 `MediaAsset` 输出，前端零改动即可展示
- **文件**: 
  - `lib/parsers/instagramPlaywright.ts`
  - `lib/media/fetchers/instagram.ts`
  - `lib/fs/saveMedia.ts`

### 4. 批量 ZIP 下载功能
- **状态**: ✅ 已完成
- **优先级**: 中
- **描述**: 后端通过 `archiver` 动态打包当前会话已下载的媒体，前端的 "Download All" 按钮直接拉取 ZIP
- **实现要点**:
  - `/api/download-all` 接口校验传入的 `downloadUrl`，按需重命名后写入 ZIP（`app/api/download-all/route.ts`）
  - 前端在成功展示区域提供一键下载，包含加载与错误提示（`app/page.tsx`）
  - ZIP 文件输出在 `public/downloads`，与单文件下载保持一致
- **后续优化想法**:
  - 可拆分出 `lib/utils/zipCreator.ts` 以便复用
  - 考虑异步清理历史 ZIP，避免目录膨胀

### 5. 限流保护
- **状态**: ⏳ 待完成
- **优先级**: 中
- **描述**: 添加 API 限流保护，防止滥用
- **要求**:
  - 实现基于 IP 的限流
  - 限制单次请求的媒体数量（已实现：最多 10 个）
  - 限制单位时间内的请求次数
  - 返回适当的错误信息
- **文件**: 
  - `lib/middleware/rateLimiter.ts` (新建)
  - `app/api/media/route.ts` (更新)

### 6. 对象存储支持
- **状态**: ⏳ 待完成
- **优先级**: 低（可选）
- **描述**: 支持将媒体文件存储到对象存储服务（如 AWS S3、阿里云 OSS 等）
- **要求**:
  - 抽象存储接口，不影响前端和 provider 接口
  - 支持本地文件系统（当前实现）和对象存储
  - 配置化选择存储方式
  - 支持多种对象存储服务商
- **文件**: 
  - `lib/storage/storageInterface.ts` (新建)
  - `lib/storage/localStorage.ts` (新建)
  - `lib/storage/s3Storage.ts` (新建，示例)
  - `lib/fs/saveMedia.ts` (重构)

## 待完成任务总览

| 优先级 | 编号/任务 | 关键工作 | 责任文件 |
| --- | --- | --- | --- |
| 中 | 5. 限流保护 | IP 维度与请求频次双重限流，业务/系统错误提示 | `lib/middleware/rateLimiter.ts`（新建）、`app/api/media/route.ts` |
| 低 | 6. 对象存储支持 | 提供本地/云存储抽象层，支持 S3/OSS 等实现 | `lib/storage/*`（新建）、`lib/fs/saveMedia.ts` |
| 低 | 7. 错误提示样式优化 | 区分业务（黄）与系统（红）提示风格 | `app/page.tsx` |
| 低 | 8. Prettier 配置 | 统一格式化 & 忽略规则 | `.prettierrc`、`.prettierignore` |
| 低 | 9. 环境变量验证 | 启动前校验必需环境变量并给出指引 | `lib/config/envValidator.ts`（新建） |
| 低 | 10. 日志系统 | 结构化日志工具、按级别输出 | `lib/utils/logger.ts`（新建） |

## 其他改进建议

### 7. 错误提示样式优化
- **状态**: ⏳ 待完成
- **优先级**: 低
- **描述**: 根据计划要求，使用不同样式和颜色区分业务错误和系统错误
- **要求**:
  - 业务错误（解析失败、不支持 URL、Instagram 未实现）：黄色提示
  - 系统错误（网络超时、服务器异常）：红色提示
- **文件**: `app/page.tsx`

### 8. Prettier 配置
- **状态**: ⏳ 待完成
- **优先级**: 低
- **描述**: 添加 Prettier 配置文件，统一代码格式
- **文件**: `.prettierrc`, `.prettierignore`

### 9. 环境变量验证
- **状态**: ⏳ 待完成
- **优先级**: 低
- **描述**: 在启动时验证必需的环境变量，提供清晰的错误提示
- **文件**: `lib/config/envValidator.ts` (新建)

### 10. 日志系统
- **状态**: ⏳ 待完成
- **优先级**: 低
- **描述**: 添加结构化日志记录，便于调试和监控
- **文件**: `lib/utils/logger.ts` (新建)

---

## 完成状态统计

- ✅ **已完成**: 15 个核心功能（包含第一阶段 2 项 + Instagram/ZIP 两大扩展）
- ⏳ **待完成**: 6 个功能（均为第二阶段/改进类）

## 优先级说明

- **高**: 第一阶段必须完成的功能
- **中**: 第二阶段核心功能扩展
- **低**: 可选改进和优化

---

*最后更新: 2025-11-19*

## 最近完成

- ✅ Instagram Provider Playwright 化：`lib/parsers/instagramPlaywright.ts` + `lib/media/fetchers/instagram.ts`
- ✅ "Download All" 全链路 ZIP 打包：`app/api/download-all/route.ts` + `app/page.tsx`
- ✅ 添加了 "Download all" 按钮（UI 占位）
- ✅ 完成了单元测试设置和编写（Jest + 测试库）
  - `detectProvider` 测试：覆盖 Twitter/X.com、Instagram URL 识别及边界情况
  - `saveMedia` 测试：覆盖文件扩展名推断、文件名生成、目录创建、文件大小限制等
  - 总计 30 个测试用例全部通过
- ✅ Twitter 解析已迁移至自建 Playwright 爬虫（无需第三方接口）

