# 赫敏的精细角色模型

在仓库根目录执行以下命令（Python 3、NumPy、Pillow）：

```sh
python3 tools/blender/hermione/build.py
```

构建器会读取游戏现有的精细哈利骨架和动画、赫敏的学院模型、已有面部定位点及纹理，生成 `assets/3d/magic/characters/hermione-scholar.glb`。眼部纹理、活动睑缘、唇边、头发、织物褶皱和魔杖雕纹均在构建时生成。使用 `--output 新模型.glb` 可指定其他输出位置。
