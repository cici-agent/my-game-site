// Each row corresponds to one saved story step. A beat is completed inside the world.
const at = (spot, kind, label, extra = {}) => ({spot,kind,label,...extra});
const talk = (spot, who, label, choice = 0) => at(spot,'talk',label,{who,choice});
const beat = (goal, ...targets) => ({goal,targets});
const spell = (spot, label, prop, choice = 0) => at(spot,'spell',label,{prop,choice});
const walk = (spot, label, choice = 0) => at(spot,'cross',label,{choice});
export const MISSIONS = {
  'kings-cross': [
    [beat('走近哈利核对车票，或去看看站牌旁的猫头鹰。',talk('npc','harry','与哈利核对车票'),at('inspect','inspect','留意猫头鹰的去向',{choice:1,prop:'owl'}))],
    [beat('去问韦斯莱夫人，隐藏的站台在哪里。',talk('target','molly','向韦斯莱夫人问路')),
     beat('穿过九号和十号站台之间的隔墙。',walk('exit','穿过站台隔墙'))]
  ],
  platform: [
    [beat('罗恩的箱子卡住了。走近，把行李抬起来。',at('npc','pickup','抬起罗恩的行李箱',{prop:'trunk',who:'ron'})),
     beat('把行李带到发车牌旁的金色标记。',at('target','drop','把行李放稳',{choice:0}))],
    [beat('沿红色列车找到车门，登上特快。',walk('exit','登上特快列车'))]
  ],
  express: [
    [beat('沿过道找纳威，问问他丢失的蟾蜍。',talk('npc','neville','询问纳威'),talk('target','hermione','和赫敏分头调查',1))],
    [beat('去车厢另一头，检查座椅旁的踪迹。',at('inspect','inspect','查看湿脚印',{prop:'tracks',choice:0}),talk('exit','hermione','核对目击记录',1))]
  ],
  lake: [
    [beat('找到提灯的海格，告诉他列车上的线索。',talk('npc','hagrid','和海格说话')),
     beat('走向岸边的灯，乘船横渡黑湖。',at('target','boat','登上小船'))],
    [beat('到船坞把莱福带回纳威身边。',at('inspect','pickup','接住莱福',{prop:'toad'})),
     beat('走近纳威，把蟾蜍交还给他。',talk('exit','neville','将莱福还给纳威'))]
  ],
  sorting: [
    [beat('沿礼堂中间的过道找到麦格教授。',talk('npc','mcgonagall','听麦格教授点名'))],
    [beat('走到分院凳前，戴上分院帽。',at('target','inspect','戴上分院帽',{prop:'hat'})),
     beat('找到长桌旁的哈利，和朋友会合。',talk('exit','harry','与同学相约明早见',1))]
  ],
  charms: [
    [beat('在魔咒教室找到弗立维教授。',talk('npc','flitwick','观察挥杖动作'),talk('target','hermione','请赫敏示范',1))],
    [beat('走近羽毛，挥动魔杖让它从桌面升起。',spell('inspect','使羽毛漂浮','feather'))]
  ],
  'team-puzzle': [
    [beat('绕到屏风侧面，找到看得清纸环的位置。',at('inspect','inspect','从侧面观察纸环',{prop:'ring'}),talk('npc','neville','与纳威约定手势',1))],
    [beat('回到施法位置，把羽毛送过金色纸环。',spell('target','引导羽毛穿环','ring'))]
  ],
  'library-record': [
    [beat('找到德拉科，问他在哪里捡到了旧图。',talk('npc','draco','问起借阅记录'),at('inspect','inspect','核对旧图上的缺口',{prop:'book',choice:1}))],
    [beat('带课堂合记去找斯内普，比对图上的窗。',talk('target','snape','打开课堂合记'))]
  ],
  'trapdoor-return': [
    [beat('赶到蓝门旁，把密道线索交给麦格教授。',talk('npc','mcgonagall','把线索告诉麦格'))],
    [beat('靠近挡路的画框，施放漂浮咒清出通道。',spell('inspect','举起倾倒的画框','frame'))],
    [beat('走过清出的通道，在回廊尽头与邓布利多会合。',talk('exit','dumbledore','交回学年的手记'))]
  ]
};

export const SPEECH = {
  harry:'你的票也是九又四分之三？我们一起找吧。', molly:'就在九号和十号之间。看准那面砖墙，径直往前走。', ron:'搭把手！箱子抬起来，我来把笼扣扣好。', neville:'你见过莱福吗？它跳出去的时候，我只听见盒盖响了一声。',
  hermione:'我们分开看，再把各自找到的线索拼起来。', hagrid:'一年级新生，这边来！带上你们的箱子，上船喽。', mcgonagall:'新生们，请跟我来。走到你被叫到名字的地方。', flitwick:'看着目标，轻轻一挥，一抖。让它自己从桌面升起来。',
  draco:'这张图有个缺角。要查就去翻借阅记录。', snape:'把你亲眼看见的，和你猜的，分开来讲。', dumbledore:'记下你们同行的路吧。故事里最难忘的，往往是有人愿意等你。'
};
