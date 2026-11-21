# 魔法学院可玩角色

三位学生使用同一套动作母版。三份 GLB 各自包含一名角色的脸部、头发、身体、三套服装、三根魔杖、骨架与动作。贴图已经嵌入模型。首次从魔法学院常规入口进入时可选择人物，进入场景后可从右上角的「角色衣装室」重新试装。确认穿戴会把选择保存在当前浏览器。

| 模型 | 默认魔杖 | 可换装扮 |
| --- | --- | --- |
| `harry.glb` · 哈利·波特 | 冬青木 | 学院长袍、课堂制服、旅行便装 |
| `hermione.glb` · 赫敏·格兰杰 | 葡萄藤木 | 学院长袍、课堂制服、旅行便装 |
| `ron.glb` · 罗恩·韦斯莱 | 柳木 | 学院长袍、课堂制服、旅行便装 |

## 模型接入

GLB 采用米制单位，Y 轴向上，人物正面朝 +Z，原点位于脚下。默认展示学院长袍和角色自己的魔杖。骨骼动画 `Idle`、`Walk`、`Run` 都可循环播放。Cast 包含完整绕杖、挥出和收势，站定时按 F 或点击「挥杖施法」。位移由游戏控制，魔杖随持杖手运动。

站点内的模型位于 `assets/3d/magic/characters/`。游戏和衣装室共用 `js/magic/characters.js` 中的加载、切装与动画逻辑。

```js
const wizard = await loadCharacter({ hero: 'hermione', outfit: 'uniform', wand: 'vine' });
scene.add(wizard.root);
wizard.setEquipment({ outfit: 'travel', wand: 'willow' });
// 每帧传入碰撞处理后实际移动的水平距离，单位为米。
wizard.animateTravel(deltaSeconds, horizontalDistance);
```

移植到其他引擎时，先把名称以 `Optional_` 开头的材质恢复为完全不透明，然后以节点可见性控制穿戴。在下面两组节点中各显示一个，其余隐藏。发丝使用的透明贴图需保留。

- 服装组：`Outfit_robe`、`Outfit_uniform`、`Outfit_travel`。
- 魔杖组：`Wand_holly`、`Wand_vine`、`Wand_willow`。

在衣装室选择「哈利」和「五阶岔路斜襟短袍」，或从人物工作室进入 `magic-academy.html?arrival=castle&look=pathfinder`，可穿着已制作的五阶短袍和魔杖在城堡中试玩。此入口按需加载精细哈利。衣装室确认其他装扮后，游戏恢复普通可换装人物。键盘使用方向键或 WASD 行走，按住 Shift 跑步。触屏轻推摇杆行走，推至外缘跑步。

## 源文件

使用 Blender 在站点根目录运行 `blender -b -P tools/blender/build_magic_characters.py` 可重新生成模型。服装轮廓与骨架位于该脚本中。导出时会读取 `tools/blender/motion/student-motion.npz`，按腿长缩放步幅，再按鞋底高度调整脚踝与膝盖。游戏从动作内的 `extras.groundSpeed` 读取原始步幅对应的速度，走路、跑步均使用 1.2 倍节奏。游戏按实际移动距离推进步相，角色提速时，换脚也同步加快。面料与头部分别由同目录的 `magic_character_cloth.py` 和 `magic_character_heads.py` 生成。面部参考贴图、定位点及各人物的纹理位于 `art/textures/characters/`。

人物为电影造型启发的同人游戏模型。面部基础网格改编自 Google MediaPipe 的 `canonical_face_model.obj`，按 Apache License 2.0 提供。各人物使用单独生成的正面肤色贴图与定位点拟合网格。原始基础网格和许可证随建模源文件保存在 `tools/blender/face_topology/` 下。

## 加入下一位角色

与三位学生使用相同 15 关节骨架的新角色可以直接套用这份动作。独立 GLB 可用 Python 3 和 NumPy 在仓库根目录运行下例，完整人物的重建命令也会自动执行这一步。

```sh
python3 tools/blender/motion/student_motion.py new-student.glb new-student-animated.glb
```

要加入常规选角，请将新模型和头像放到现有角色资源目录，在 `js/magic/character-catalog.js` 的 HEROES 中登记名字、标识和默认魔杖，并提供当前衣装室所需的服装和魔杖节点。固定造型可使用精细哈利所采用的已登记试玩入口。

新模型应使用米制单位、Y 轴向上，正面朝 +Z，两只鞋的底部各自受对应脚骨驱动。角色入库时检查两步循环、走转跑、碰墙和站定。显著不同的体型和高跟鞋可另设适配。其他骨架可通过标准 VRM Animation 动作交换，再做一次针对该角色的触地校准。动作来源见 `assets/3d/magic/characters/motion-credits.txt`。


## 角色制作包与线上工作室

从衣装室进入角色动作工作室，查看精细哈利、试用本地 VRM 或下载制作包。制作包包含学院 GLB 转换工具、四份标准 VRMA、移动与表情及施法模块、赫敏和罗恩示例。标准学生的每次模型重建都会安装 Idle、Walk、Run、Cast。在城堡行走、角色换装或切入剧情时，施法会随人物状态收束。

- 完整接入步骤见 [制作包说明](../tools/blender/motion/使用说明.md)，模型支持的表情命名见 [表情映射](../js/magic/portrait-expression.js)。
- 使用 Three.js 时，通过 loadCharacter 返回的 canCast 判断是否有施法动作，站定时调用 cast()，每帧继续调用 animateTravel(dt, distance)。固定造型随人物选择存档。
- 从仓库根目录运行 `python3 tools/character-studio/package-kit.py`，可按当前模型和运行时重新生成线上下载包。试用页源码和构建入口位于 tools/character-studio。


## 赫敏的精细学院造型

衣装室中选择赫敏和「格兰芬多学院礼袍」即可保存这套造型。直接打开 `magic-academy.html?arrival=castle&look=scholar` 可穿这套校服进城堡。角色工作室的 `character-studio/hermione.html#run` 和 `#cast` 分别播放跑步和施法；可切换面部特写、半速和杖尖轨迹。

模型取自赫敏自己的脸部纹理和定位点，沿用学院动作骨架及精细角色的握姿，按赫敏的腿长校准步幅。发梢和校袍下摆的次级动作、眼睑和嘴唇的表情均烘焙在 GLB 内。重建方法见 [赫敏模型源文件](../tools/blender/hermione/README.md)。
