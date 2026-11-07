# 魔法学院可玩角色

三份 GLB 各自包含一名角色的脸部、头发、身体、三套服装、三根魔杖、骨架与动作。贴图已经嵌入模型。首次从魔法学院常规入口进入时可选择人物，进入场景后可从右上角的「角色衣装室」重新试装。确认穿戴会把选择保存在当前浏览器。

| 模型 | 默认魔杖 | 可换装扮 |
| --- | --- | --- |
| `harry.glb` · 哈利·波特 | 冬青木 | 学院长袍、课堂制服、旅行便装 |
| `hermione.glb` · 赫敏·格兰杰 | 葡萄藤木 | 学院长袍、课堂制服、旅行便装 |
| `ron.glb` · 罗恩·韦斯莱 | 柳木 | 学院长袍、课堂制服、旅行便装 |

## 模型接入

GLB 采用米制单位，Y 轴向上，人物正面朝 +Z，原点位于脚下。默认展示学院长袍和角色自己的魔杖。骨骼动画 `Idle` 与 `Walk` 都可循环播放。位移由游戏控制，魔杖随持杖手运动。

站点内的模型位于 `assets/3d/magic/characters/`。游戏和衣装室共用 `js/magic/characters.js` 中的加载、切装与动画逻辑。

```js
const wizard = await loadCharacter({ hero: 'hermione', outfit: 'uniform', wand: 'vine' });
scene.add(wizard.root);
wizard.setEquipment({ outfit: 'travel', wand: 'willow' });
// 每帧传入秒数和当前移动强度。静止为 0，正常行走为 1。
wizard.animate(deltaSeconds, movement);
```

移植到其他引擎时，先把名称以 `Optional_` 开头的材质恢复为完全不透明，然后以节点可见性控制穿戴。在下面两组节点中各显示一个，其余隐藏。发丝使用的透明贴图需保留。

- 服装组：`Outfit_robe`、`Outfit_uniform`、`Outfit_travel`。
- 魔杖组：`Wand_holly`、`Wand_vine`、`Wand_willow`。

## 源文件

使用 Blender 在站点根目录运行 `blender -b -P tools/blender/build_magic_characters.py` 可重新生成模型。服装轮廓、骨架和动作位于该脚本中。面料与头部分别由同目录的 `magic_character_cloth.py` 和 `magic_character_heads.py` 生成。面部参考贴图、定位点及各人物的纹理位于 `art/textures/characters/`。

人物为电影造型启发的同人游戏模型。面部基础网格改编自 Google MediaPipe 的 `canonical_face_model.obj`，按 Apache License 2.0 提供。各人物使用单独生成的正面肤色贴图与定位点拟合网格。原始基础网格和许可证随建模源文件保存在 `tools/blender/face_topology/` 下。
