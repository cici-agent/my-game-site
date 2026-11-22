# 工坊人物复用适配底座

当前实现 B01（固定来源导入）、B02（独立 Three 表现适配）和 B03（独立战斗、跳跃和表情动作层）。正式来源固定为工坊提交 `65154a9106f34fc3f76fb1b9613cf28c2f93b6cd`，导入精细哈利、精细赫敏及精细罗恩。三者均由主 PM 核实工坊已完成交付；哈利源 hash 与原发布完全一致。游戏入口由整合负责人接入，实机视觉和五人性能仍须单独验收。

在 `rpg-online` 下运行：

```sh
node chapter-one/presentation/import-workshop.mjs
node chapter-one/presentation/import-workshop.mjs --verify
node --test tests/chapter-one-presentation.test.mjs
```

可用 `--source /path/to/repository` 指定持有相同提交的工坊仓库。导入器只执行 `git show 固定提交:路径`，先核对全部源字节，再写入版本目录。`frozen-sources.json` 固定十项源文件的 SHA-256；目标目录中的 `manifest.json` 不含本地时间，因此可重复生成。许可证随发布资产保留。旧 `612434e54cf7` 目录及 `frozen-sources.612434e54cf7.json` 保留；显式传入 `workshop-612434e54cf7` 可用于历史回退与 15 骨、无表情形态能力测试。当前默认版本为 `workshop-65154a9106f3`，不会自行切到未来工作树。

## 调用接口

```js
import { loadPlayableCharacter } from './playable-character.mjs';

const actor = await loadPlayableCharacter('harry');
scene.add(actor.root);
actor.root.position.copy(authoritativeOrInterpolatedPosition);
actor.root.rotation.y = authoritativeOrInterpolatedYaw;
actor.updateTravel(dt, collisionResolvedHorizontalDistance, grounded, verticalVelocity, seated);
const wandTip = actor.getCastOriginWorld();
const backpackAnchor = actor.getAnchorWorldMatrix('backAccessory');
// 每人退出时，仅释放这一实例。
actor.dispose();
```

`root` 是控制器坐标层。其子层绕 Y 旋转 π，将源模型 +Z 朝前转为现有控制器的 −Z；源网格、骨架绑定和动作曲线不改。不要再对 `model` 施加一次转向。三角色仍保留各自原比例。

`updateTravel` 的距离单位是米，只接收碰撞之后的实际水平距离。传送/检查点跳转应调用 `resetPresentation`，不可把瞬移距离计入步相。沿用原版 `character-motion.js` 的步幅、走跑融合、脚底校准及表情模块。哈利约 1.308/2.808 米每秒，赫敏约 1.264/2.713，罗恩约 1.380/2.962；服务器限速和位置权威由 DEV-A/F 提供，本模块不计算角色移动、伤害或经验。

每个实例都有独立骨架、动画混合器、形态权重和材质副本。库只共享只读几何、动画和贴图；最后一个实例释放时才释放缓存源资源。若调用 `createCharacterPresentation(gltf, ...)`，调用方持有 `gltf` 的源资源所有权，适配器只释放自己的状态和材质。不要把同一源对象交给两个各自管理释放的资产库。

挂点按实际名字映射，支持当前 15/22 骨并保留颈和手指附加骨。杖尖取各武器网格真实远端顶点，并在查询时执行当前皮肤变换和世界变换；不是相机偏移。`backAccessory` 优先使用现有同名锚点，否则映射 `Chest`（缺失时 `Hips`），返回挂点的世界矩阵。背包网格的局部安装偏移、遮挡和穿插仍要在实机中校准，不能改源骨架来凑挂点。

三名当前精细人物均保留 22 骨。哈利实际有 17 个命名形态，赫敏与罗恩各 23 个，包含脸部及各自头发/袍摆通道；沿用已有旅行表情和源动画，不再附加同通道实时风。语境接口 `setExpressionContext({mood,intensity,lookX,lookY,talking})` 支持 neutral/focused/combat/happy/hurt/curious，额外脸部权重在下一帧恢复各网格原基线后重新叠加。三套精细人物都为固定已发布造型，不接受属性装备覆盖外观。历史标准人物仍明确报告没有脸部 morph，并只切换源有的 `Outfit_*`、`Wand_*` 可见组。数值权限由外层管理。

## 本轮验收边界

`playStudioCast(actionId)` 只播放原版完整教学演示动作，保持约 3.1667 秒；精细赫敏、罗恩及历史标准人物的释放元数据为 2.4583 秒。走动/跳跃/坐下取消完整教学动作，战斗使用独立上半身层：只采样原 Cast 释放附近关键姿态，不缩放全长绕杖动画，不改写源轨道。腿部继续按真实水平距离行走；跳跃姿态由 grounded/verticalVelocity 驱动，落地有短暂缓冲，根节点位置仍完全归控制器所有。

```js
actor.playAuthoritativeAction({
  actionId: 'server-action-unique-id', skillId: 'bolt',
  startAtMs: 1000, releaseAtMs: 1120, endAtMs: 1520, nowMs: serverNowMs,
  outcome: 'hit'
});
// updateTravel 后读取，只用于音画；不能据此产生伤害、XP或奖励。
for (const event of actor.consumePresentationEvents()) {
  if (event.type === 'release') emitVisualFrom(actor.getCastOriginWorld(), event);
}
actor.cancelAction('server-action-unique-id', 'stunned');
actor.playHit({strength: .8, direction: -1});
actor.setMotionLayersEnabled(false); // 同机位与源动作比较时关闭新增层
```

时间戳统一毫秒、来自同一服务器时钟；dt 始终秒。未提供 release 时 bolt 默认起手120毫秒、H1/interrupt默认150毫秒。重复动作ID不会重新播放；过期动作拒绝；延迟事件按 nowMs 追上当前进度。取消后不会补发release，结束和释放均最多一次。技能中断后新增上身层约120毫秒淡出。`resetPresentation` 清除当前动作和姿态，不改权威状态。

持续魔法可传 `holdUntilMs`，必须在 release 与 end 之间：到释放时刻举杖，维持该姿态直到持续段结束，再收势。漂浮咒使用服务器的 0.8 秒起手与后续 2 秒持续值；移动、受击取消仍由服务器决定。

为抵消请求往返延迟，世界控制器可用独立的 `local-preview:*` ID 加 `preview:true` 立即播放短预备姿态。预备动作不产生 release/end/cancel 音画事件，更不会出弹或结算；收到服务器动作后由真实 ID 和时间戳接替，原请求结束但未获得有效动作时收势，最久约 1 秒自然停止。不要把该标记发送到战斗权威端。

`loadPlayableCharacter` 为五名角色提供同一接口。纳威/乔治继续用已有 `createAvatar`，明确返回 `existing-procedural-character`；没有工坊精修GLB或脸部形态时不假称具备。两者沿用既有走跳与施法，短动作释放重映射到服务器时点，未修改旧 avatar 源文件。三名精修角色加载失败会明确报错，不会静默换成程序化人物。

实际可玩接口还附加 `setPresentationState({flying,downed,floorY:0})`。骑乘时显示独立木柄/铜箍/枝束扫帚并叠加跨坐、握持姿态；倒地时只让视觉髋部支点向地面侧倒，恢复生命后平滑复起，权威 `root` 坐标不动。落地高度来自控制器，避免角色在半空受击后仍悬着直立。玩家与同队已参战角色均使用同一层；`setMotionLayersEnabled(false)` 可连同该层一并关闭，`resetPresentation` 清除骑乘/倒地状态。源 GLB、骨架绑定和动画轨道保持不变。

Node 测试载入真实 GLB 的几何、皮肤、形态和动画，跳过图片解码。17项测试覆盖源 hash、15/22 骨、父层方向、源曲线不变、实际距离、杖尖变换、脚底接触、多实例资源释放、精确释放/重复/取消/迟到、移动施法、跳跃落地、表情恢复、持续施法、无释放预备姿态、五角色接口，以及骑乘/倒地/复起的坐标隔离和资源释放；不等于材质视觉、步态自然度、五人渲染性能或联网实机通过。接入前仍需同机位全身/面部对照、实际材质渲染、五人目标设备测试及快咒释放回归。

## 场景空间与接触约定

新家具使用共享米制描述生成可见实体、碰撞形状和接触点，不能分别手写三份尺寸。车厢范例为 `chapter-one/train-layout.mjs`：每张座椅的坐垫、靠背、扶手与碰撞来自同一份 parts；乘客占用具体 seat，不再使用统一的抬高偏移。碰撞采用落地家具的保守实体包络，装饰缝线和软垫倒角不扩张通行体积。

显式座位参数 `seat = {surfaceY, frontZ, backZ, floorY, width}` 全部位于人物 root 局部坐标，面向 -Z；不得混入世界坐标。程序 NPC 通过 `update(dt, {action:'sit', seat})` 接入，工坊角色通过 `updateTravel(dt, distance, grounded, verticalVelocity, seated, seat)` 接入。共用接触解算按真实腿长和衣物厚度定位髋、膝、脚；短腿自然垂足，低椅则落脚。变化只作用于展示层，不能修改玩家权威 root 或原始工坊文件。

任务触发范围不等于场景物件：移动、门口、跟随、对话点不生成菱形或地圈。实体目标用 `presentation.prop` 声明真实物件；其位置是支撑面的接触锚点，不能再在不登记碰撞的情况下增加大箱子。附近可见且可操作的对象才显示一个提示；隔墙不可交互。战斗危险范围和飞行训练环属于玩法实体，保留独立呈现。

修改布局或角色适配时，必须运行真实模型的座位接触检查、家具可见包络与碰撞一致性、出生点/门口/任务站位可达性，以及实际世界控制器回归。检查既包含首帧和稳定坐姿，也包含起身恢复与现有船上行为。自动检查只能覆盖已声明约束；仍需在游戏中查看人物正侧面和实际走过通道。
