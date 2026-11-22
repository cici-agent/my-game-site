import { contentData } from '../data/index.mjs';
import { getRoomView } from '../dungeons/stone-route.mjs';
import { getSceneNavigation } from '../client/scene-navigation.mjs';
import { getFlightPermission } from '../rules/flight.mjs';

export const SPAWN = Object.freeze({ x: 0, y: 0, z: 6, yaw: 0 });
export const ESCORT_START = Object.freeze({ x: 1.8, y: 0, z: 5.2 });
export const BOUNDS = Object.freeze({ minX: -10, maxX: 10, minZ: -14, maxZ: 12 });
const step = (label, kind = 'interact', extra = {}) => ({ label, kind, ...extra });
const talk = label => step(label, 'talk');
const visit = label => step(label, 'move');
const fight = (label, enemyId) => step(label, 'battle', { enemyId });
const hold = (label, seconds = 2) => step(label, 'hold', { seconds });
const escort = (label, seconds = 4) => step(label, 'escort', { seconds, npc: '海格' });
const authored = {
 M01: [step('跟上韦斯莱夫人，穿过站台入口','escort',{seconds:5,npc:'韦斯莱夫人'}), visit('走到霍格沃茨特快车门')],
 M02: [step('在行李旁找回纳威的蟾蜍', 'collect'), step('收起巧克力蛙画片', 'collect'), talk('与车厢里的同伴会合')],
 M03: [escort('跟海格走下湖岸山路'), escort('在码头与海格会合'), step('登船，随海格渡过黑湖', 'boat', { seconds: 18, npc: '海格' }), escort('靠岸后跟海格走到城堡入口')],
 M04: [talk('麦格教授：欢迎来到霍格沃茨'), fight('向低处瞄准小蜘蛛，施放基础咒击', 'PAPER-L1'), fight('侧移避开小蝙蝠的低空扑击，再完成考核', 'BOX-L6')],
 M05: [step('找到课堂材料并搬到教学台', 'collect'), talk('弗立维教授：学习荧光咒'), visit('找到图书馆练习委托台')],
 M06: [step('召来扫帚并起飞', 'flight', { minY: .6 }), step('沿低空路线追上记忆球', 'flight', { minY: .8 }), step('平稳降落并归还记忆球','move',{requiresLanding:true})],
 M07: [step('等待巡夜者离开路口', 'sneak', { seconds: 3 }), visit('沿书架后穿过走廊'), hold('观察三头犬与活板门，退回安全处')],
 M08: [step('将花盆搬到温室工作台', 'collect'), fight('观察练习藤蔓的前摇并完成护理', 'VINE-L14')],
 M09: [hold('借书架遮挡，清理第一处堵路物'), hold('避开皮皮鬼投掷，归还第二处书本'), hold('清理第三处并穿过走廊')],
 M10: [step('向羽毛施放漂浮咒', 'cast', { skillId: 'levitate' }), step('移动重物并放入教学标记', 'cast', { skillId: 'levitate' }), talk('弗立维教授：确认漂浮课程完成')],
 M11: [fight('躲开根团横扫并打开救援通路', 'ROOT-L16'), hold('救起受困的训练同伴', 2.5), talk('完成救援及个人专招课程')],
 M12: [hold('打开撤离通道'), visit('寻找碎裂痕迹'), visit('走到盥洗室前的安全点')],
 M13: [step('进入万圣节巨怪副本', 'boss', { encounterKind: 'troll' })],
 M14: [step('沿低空路线稳定扫帚', 'flight', { minY: .8 }), visit('绕开看台障碍，查找危险来源'), talk('确认同伴安全')],
 M15: [step('检查圣诞礼物与隐形衣线索', 'collect'), step('等待巡逻空档进入书架后方', 'sneak', { seconds: 3 }), visit('找到魔镜房入口')],
 M16: [hold('靠近厄里斯魔镜观察愿望'), talk('听邓布利多解释魔镜'), visit('离开镜前并记录线索')],
 M17: [step('从画片找到勒梅的名字', 'collect'), step('在书架找到魔法石资料', 'collect'), hold('把三份证据放入调查记录')],
 M18: [escort('跟海格来到龙蛋旁'), hold('布置隔热物件并安抚诺伯'), step('收好照护记录', 'collect')],
 M19: [step('准备查理朋友的交接信息', 'collect'), hold('准备保护容器'), visit('勘察塔楼安全停靠点')],
 M20: [hold('抬起诺伯的运输容器'), step('在安全停靠点安抚诺伯', 'sneak', { seconds: 3 }), talk('与塔楼接应者完成交接')],
 M21: [escort('跟海格检查照明与林地路线'), escort('沿海格引导穿过林地'), step('记录第一处银色血迹', 'collect')],
 M22: [step('记录断枝与血迹的方向', 'collect'), fight('清理第一处强敌根团', 'ROOT-L20'), fight('清理第二处强敌根团', 'ROOT-L20'), visit('抵达禁林会合点')],
 M23: [visit('利用树木遮挡，离开黑影逼近路线'), step('跟随费伦泽撤离', 'escort', { seconds: 4, npc: '费伦泽' }), hold('照看落后的同伴并与海格会合')],
 M24: [fight('完成期末施法与移动考核', 'VINE-L22'), step('稳定漂浮教学重物', 'cast', { skillId: 'levitate' }), step('完成飞行转向并落地', 'flight', { minY: .6 })],
 M25: [talk('向海格核对陌生人和路威线索'), hold('启动音乐装置，确认放手后持续演奏')],
 M26: [hold('归档勒梅、魔法石与禁林线索'), talk('确认漂浮、飞行和救援课程资格'), visit('走到夜游集结点')],
 M27: [hold('完成器材搬运、音乐装置和解救演练', 4), hold('取出补给并搬到安全集结点', 4), hold('标记目标并核对同伴协作课程', 4)],
 M28: [talk('与纳威交谈，确认当晚行动'), hold('启动音乐装置使三个头入睡', 3), step('音乐仍在演奏，打开活板门', 'music-gate')],
 M29: [hold('停止挣扎，放松身体'), hold('用房内明火装置处理根结'), visit('沿松开的藤蔓通路脱身')],
 M30: [hold('观察锁孔，认出折翼银钥匙'), step('骑扫帚追上正确飞钥匙', 'flight', { minY: .8 }), step('降落并用银钥匙开门', 'key-gate')],
 M31: [step('观察棋盘：骑士应走哪种路线？', 'puzzle', { puzzle: 'chess', options: ['沿直线冲到对岸', '沿L形移动，避开被攻击格', '跨过整张棋盘'], answer: 1 }), hold('等待对方回合后移动友方棋子'), visit('沿获胜的安全棋格穿过棋阵')],
 M32: [hold('观察已经倒下的巨怪与闯入痕迹'), visit('走入药水房，不攻击倒地巨怪')],
 M33: [step('观察线索：可前进的药瓶不在两端，位于毒药左边', 'puzzle', { puzzle: 'potions', options: ['左端圆瓶', '中间小瓶', '右端长瓶'], answer: 1 }), hold('分配通行药水'), visit('穿过前方火焰门')],
 M34: [step('在魔镜密室保护魔法石', 'boss', { encounterKind: 'stone' })],
 M35: [talk('在医院与邓布利多交谈'), talk('与同伴会合，核对事件真相'), visit('走出病房回到校园')],
 M36: [talk('参加学年收尾并查看个人冒险记录'), step('前往返程站台：24级且完成核心首通', 'ending')],
};
const positions = [{ x: -1.5, y: 0, z: 3 }, { x: 1.5, y: 0, z: -.5 }, { x: -1.5, y: 0, z: -4 }, { x: 1.5, y: 0, z: -6 }];
export const runtimeQuests = Object.freeze(contentData.quests.map(q => ({
 ...q, sceneId: contentData.questSceneMap[q.id][0],
 objectives: authored[q.id].map((o, index) => ({ ...o, id: `${q.id}-${index + 1}`, position: positions[index % positions.length], radius: 2,
  actionType: ['battle','boss'].includes(o.kind) ? 'encounter' : o.kind === 'cast' ? 'skill' : 'interact' })),
})));
export const questById = new Map(runtimeQuests.map(q => [q.id, q]));
export const SERVICE_POSITION = Object.freeze({ x: 1.5, y: 0, z: 5 });
export const TRAINING_POSITION = Object.freeze({ x: -1.5, y: 0, z: 5 });
export const serviceAnchors=Object.freeze(contentData.world.npcs.map((n,index)=>({...n,position:n.serviceId==='SERVICE-GEAR'?{x:1.5,y:0,z:1}:n.serviceId==='SERVICE-POST'?{x:-1.5,y:0,z:1}:SERVICE_POSITION})));
export const dangerQuestIds=new Set(['M12','M13','M28','M29','M30','M31','M32','M33','M34']);
export const isSafeExploration=character=>!dangerQuestIds.has(character.activity?.questId??character.currentQuestId)||!!character.visitSceneId;
export function availableServices(character){
 return character.completedQuestIds.includes('M04')&&isSafeExploration(character)?serviceAnchors.filter(s=>s.sceneId===character.sceneId):[];
}

export function commissionUnlocked(character, cycleId) {
 const q = new Set(character.completedQuestIds);
 const gate = cycleId === 'LIBRARY-M10' ? 'M05' : cycleId === 'LIBRARY-M14' ? 'M09'
  : cycleId === 'GREENHOUSE-M14' ? 'M08' : cycleId === 'ROOTWORK-M16' ? 'M11'
  : /M18/.test(cycleId) ? 'M13' : cycleId === 'GROUNDS-M20' ? 'M20'
  : /M22/.test(cycleId) ? 'M24' : /TROLL/.test(cycleId) ? 'M13' : 'M34';
 return q.has(gate);
}
export function getSceneView(character, now = Date.now()) {
 const quest = questById.get(character.activity?.questId ?? character.currentQuestId) ?? runtimeQuests.at(-1);
 const sceneId = character.visitSceneId ?? quest.sceneId;
 const mainScene = !character.visitSceneId || character.visitSceneId === quest.sceneId;
 const currentIndex=character.activity?.objectiveIndex??character.objectiveIndex;
 let targets = mainScene && (!character.chapterComplete||character.activity) ? quest.objectives.map((t, i) => ({ ...t, answer: undefined, active: i === currentIndex, completed: i < currentIndex })) : [];
 const dungeon=mainScene&&character.dungeonRoom?.roomId===quest.id?getRoomView(character.dungeonRoom):null;
 if(dungeon&&mainScene)targets=dungeon.targets.map(t=>({...t,label:t.name,kind:t.id==='key'?'flight':'hold',seconds:t.durationMs/1000,radius:t.range,actionType:'interact',active:t.enabled,completed:t.complete,skillId:t.requiredSkillId}));
 const services=availableServices(character);
 const commissions=contentData.journalCommissionIndex.filter(q=>q.initiator.sceneId===sceneId&&commissionUnlocked(character,q.cycleId));
 for(const s of services)targets.push({id:s.serviceId,serviceId:s.serviceId,serviceIds:[s.serviceId],kind:'service',label:`${s.name} · ${s.role}`,npc:s.name,position:s.position,radius:2,actionType:'service',active:true});
 if(commissions.length)targets.push({id:'training',kind:'training',label:`${commissions[0].initiator.name} · 练习委托`,position:TRAINING_POSITION,radius:2,actionType:'training',active:true,cycleIds:commissions.map(c=>c.cycleId)});
 if(dangerQuestIds.has(quest.id)||quest.id==='M04')targets.push({id:'checkpoint-supply',kind:'service',serviceIds:['CHECKPOINT'],label:'检查点 · 免费基础补给',position:{x:0,y:0,z:6},radius:2,actionType:'service',active:true});
 const objective = quest.objectives[currentIndex];
 const flight=getFlightPermission(character,{questId:quest.id,questSceneId:quest.sceneId,objectiveKind:objective?.kind,inCombat:character.encounter?.status==='active'||character.soloEncounter?.status==='active'});
 const escortState = character.escort;
 let escortView = null;
 if (mainScene && objective && ['escort','boat'].includes(objective.kind)) {
  const savedOrigin=character.escortOrigin;
  const initialOrigin=currentIndex===0&&(!savedOrigin||(savedOrigin.x===SPAWN.x&&savedOrigin.z===SPAWN.z))?ESCORT_START:savedOrigin;
  const origin = escortState?.origin ?? initialOrigin ?? ESCORT_START;
  const progress = escortState?.progress ?? 0;
  escortView = { npc: objective.npc ?? '海格', targetId:objective.id, kind:objective.kind, progress,
   position: { x: origin.x + (objective.position.x - origin.x) * progress, y:0, z:origin.z+(objective.position.z-origin.z)*progress },
   waitingForPlayer: !escortState?.near, durationSeconds:objective.seconds };
 }
 const destinations=[...new Set([questById.get(character.currentQuestId).sceneId,...character.completedQuestIds.flatMap(q=>contentData.questSceneMap[q]??[])])].map(id=>({sceneId:id,name:contentData.scenes.find(s=>s.id===id)?.name??id}));
 const exitTarget={id:'exit',kind:'exit',label:'沿出口前往已探索区域',position:{x:0,y:0,z:-7},radius:2,actionType:'travel',active:true};
 if(character.completedQuestIds.includes('M04'))targets.push(exitTarget);
 for(const q of contentData.sideQuests){
  if(!isSafeExploration(character)||!q.prerequisites.completedQuestIds.every(id=>character.completedQuestIds.includes(id))||character.collectionIds.includes(q.reward.collectionId))continue;
  if(q.startNpc.sceneId===sceneId&&!character.acceptedSideQuestIds?.includes(q.id))targets.push({id:`side-${q.id}`,questId:q.id,kind:'side',label:`${q.startNpc.name} · ${q.name}`,npc:q.startNpc.name,position:SERVICE_POSITION,radius:2,actionType:'side',active:true});
  if(q.steps.some(s=>s.sceneId===sceneId))targets.push({id:q.id,questId:q.id,kind:'collection',label:q.summary,position:{x:1.5,y:0,z:-6},radius:2,seconds:1,actionType:'collect',active:true});
 }
 const nav=getSceneNavigation(sceneId),[minX,maxX,minZ,maxZ]=nav.bounds;
 return { sceneId, name: contentData.scenes.find(s=>s.id===sceneId)?.name ?? quest.location, quest: { id:quest.id,name:quest.name,npc:quest.initiatorNpc,description:dungeon?.hint??quest.successCondition }, targets, bounds:{minX,maxX,minZ,maxZ},spawn:SPAWN,escort:escortView,dungeon,flight,exitTarget,destinations,services,commissions,serviceTargets:targets.filter(t=>t.kind==='service'),trainingTargets:targets.filter(t=>t.kind==='training'),serverTime:now };
}
export const runtimeCatalog = Object.freeze({ quests:runtimeQuests, items:contentData.items, services:contentData.services.map(s=>({...s,...serviceAnchors.find(n=>n.serviceId===s.serviceId)})), skills:contentData.skills, commissions:contentData.journalCommissionIndex.map(c=>({...c,sceneId:c.initiator.sceneId})), scenes:contentData.scenes });
