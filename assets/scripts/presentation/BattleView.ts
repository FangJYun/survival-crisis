import { _decorator, Component, Node, UITransform, Graphics, Color, Label, input, Input,
    EventKeyboard, EventTouch, KeyCode, resources, JsonAsset, view, ResolutionPolicy, Layers, SafeArea, profiler, Vec3,
    Sprite, SpriteFrame, Rect, AudioSource, AudioClip, Mask, assetManager } from 'cc';
import {DEBUG} from 'cc/env';
import { Enemy } from '../domain/combat';
import {experienceAt} from '../domain/progression';
import { GameConfig, SLOTS, BuildingKind, SkillId } from '../domain/config';
import { distance, direction } from '../domain/movement';
import { Vec } from '../domain/ports';
import { SurvivalRun, RunState } from '../domain/survival';
import { craft, hasMaterials, usedSlots } from '../domain/inventory';
import { runValidator } from '../domain/run-validation';
import { Session } from '../application/session';
import { NewGameGate } from '../application/new-game-gate';
import { SaveStore } from '../application/save-store';
import { BootLoader } from '../application/boot';
import { watchLifecycle } from '../platform/lifecycle';
import { localStoragePort } from '../platform/storage';
import {ContentLoader} from '../application/content';
import {loadContentGroup,GameContent} from '../platform/content';
import {PlaytestStorage,SEASON_SAMPLES,seasonCheckpoint} from '../application/season-playtest';
import {outcomeCheckpoint,outcomeStorage} from '../application/outcome-playtest';
import {interfaceCheckpoint} from '../application/interface-playtest';
import {performanceCheckpoint,FrameObservation,LONG_PROBE_SECONDS,sustainedLoadConfig} from '../application/performance-playtest';
import {qaMode} from '../platform/qa-mode';
import {inputDiagnostics} from '../platform/input-diagnostics';
import {playGuide} from '../application/play-guide';
import {safeLayout} from '../application/safe-layout';
import {HeldInput} from '../application/held-input';
import {defenseLayout,DefenseShape} from '../application/defense-layout';
import {defenseCheckpoint} from '../application/defense-playtest';
import {drawDefense} from './defense-drawing';
import {BagEntry,BagTab,describeSkill,equipmentInfo,icons,materialIcon,rarityStyle,skillStyle,slotNames,supplies} from './camp-style';

const { ccclass } = _decorator;
const C = { ink:'#FFF7DE',forest:'#DBEFC7',leaf:'#78AD67',pine:'#4D925A',mist:'#466054',gold:'#885318',white:'#233F35',red:'#A03940',blue:'#226B80',edge:'#7BA271',primary:'#A8D982',peach:'#FFD6AB',sky:'#CBEBFF',paper:'#FFFCEF',shadow:'#B4C49C',sun:'#FFCC53' };
const color=(hex:string):Color=>new Color().fromHEX(hex);
const duskGround=['#AD8F5D','#B29C58','#B3865F','#8E9EB3'];
const nightGround=['#456779','#4D6D78','#5E657F','#536F8A'];
const bagTabs:readonly BagTab[]=['gear','materials','craft','tools'];
const bagTabNames={gear:'装备',materials:'材料',craft:'制造',tools:'工具'};
const meterColors={health:'#D96369',stamina:'#A26715',food:'#4F9549',xp:'#6384BD',tower:'#A97928'};
const bagPageSize=12;
const statText=(value=0)=>Number(value.toFixed(1));
type Meter=(value:number,max:number,caption:string)=>void;
type ActionTile=(status:string,fraction?:number,available?:boolean)=>void;

@ccclass('BattleView')
export class BattleView extends Component {
    private config:GameConfig|null=null;
    private session:Session|null=null;
    private store:SaveStore<RunState>|null=null;
    private saved:RunState|null=null;
    private screenRoot!:Node;
    private safeRoot!:Node;
    private safeSignature='';
    private world!:Graphics;
    private terrain!:Graphics;
    private effects!:Graphics;
    private terrainPhase='';
    private terrainPlayer:Vec|null=null;
    private terrainDiscovered=-1;
    private hudClock!:Label;
    private hudIdentity!:Label;
    private hudTemperature!:Label;
    private hudTowerRange!:Label;
    private hudMeters!:Record<keyof typeof meterColors,Meter>;
    private actionTiles:ActionTile[]=[];
    private castEffect:{id:SkillId;position:Vec;facing:Vec;started:number;range:number}|null=null;
    private message!:Label;
    private hint!:Label;
    private mode='loading';
    private placement:BuildingKind|null=null;
    private placementCell:Vec|null=null;
    private placementTouch:number|null=null;
    private placementExit:Node|null=null;
    private keys=new Set<number>();
    private moveTouch:number|null=null;
    private touchOrigin:Vec={x:0,y:0};
    private joystick:Vec={x:0,y:0};
    private readonly heldAttack=new HeldInput();
    private readonly heldBlock=new HeldInput();
    private unsubscribe:(()=>void)|null=null;
    private loading=false;
    private boot!:BootLoader;
    private background=false;
    private sequence=0;
    private newGameGate=new NewGameGate();
    private speed=1;
    private bagTab:BagTab='craft';
    private bagPages:Record<BagTab,number>={gear:0,materials:0,craft:0,tools:0};
    private bagSelected:string|null=null;
    private characterReturn:'bag'|'play'='play';
    private content=new ContentLoader<GameContent>(loadContentGroup);
    private frames:SpriteFrame[]=[];
    private sounds:Record<string,AudioClip>={};
    private audio!:AudioSource;
    private soundEnabled=true;
    private configAsset:JsonAsset|null=null;
    private sprites=new Map<string,Node>();
    private spritePool:Node[]=[];
    private spriteSeen=new Set<string>();
    private defenseNodes=new Map<string,{node:Node;signature:string}>();
    private actorOrder=0;
    private lastAudio={health:100,gathered:0,deaths:0,phase:'day'};
    private seasonColors:string[]=[C.forest,C.forest,C.forest,C.forest];
    private heroFrames:Record<string,number[]>={warden:[0,1,2,3],hunter:[4,5,6,7]};
    private resourceProbeRunning=false;
    private seasonProbe:{index:number;time:number;wall:number;restored:boolean;busy:boolean;results:string[]}|null=null;
    private outcomeProbe:'death'|'respawn'|null=null;
    private performanceProbe:FrameObservation|null=null;
    private performanceStarted=0;
    private performanceStartTime=0;
    private performanceLastFrame=0;
    private performanceInterrupted=false;
    private diagnostics:{enabled:boolean;dispose:()=>void}|null=null;
    private diagnosticLabel:Label|null=null;
    private diagnosticCounts={raw:0,engine:0,button:0};
    private diagnosticText='';
    private guidePage=0;
    private guideReturn:'menu'|'pause'='menu';
    private monsterFrames:Record<string,number>={};
    private buildingFrames:Record<string,number>={};
    private localQaMode:string|null=null;
    private get performanceEnabled():boolean{return this.localQaMode==='performance'||this.localQaMode==='performance-long';}
    private get performanceDuration():number{return this.localQaMode==='performance-long'?LONG_PROBE_SECONDS:60;}
    private get resourceProbeEnabled():boolean{return this.localQaMode==='resources';}
    onLoad():void {
        this.localQaMode=qaMode(DEBUG,globalThis);
        view.setDesignResolutionSize(1280,720,ResolutionPolicy.SHOW_ALL);profiler.hideStats();
        this.safeRoot=this.ui('SafeFrame',this.node,0,0,1280,720);this.safeRoot.addComponent(SafeArea);
        this.screenRoot=this.ui('Screen',this.safeRoot,0,0,1280,720);this.fitSafeArea();
        this.audio=this.node.addComponent(AudioSource);
        this.diagnostics=inputDiagnostics((kind,value)=>this.reportInput(kind,value));
        this.boot=new BootLoader(async()=>{
            const config=await new Promise<JsonAsset>((resolve,reject)=>resources.load('config/game',JsonAsset,(error,asset)=>error?reject(error):resolve(asset)));
            const previous=this.configAsset;config.addRef();this.configAsset=config;previous?.decRef();
            this.clearScreen();this.frames.forEach(f=>f.destroy());this.frames=[];
            const groups=await this.content.load((done,total)=>{if(this.isValid)this.backdrop(`正在进入林地… ${done}/${total}`,'正在加载通用、角色、怪物与季节内容。');});
            this.frames.forEach(f=>f.destroy());this.frames=[];
            const common=groups.get('common')!;
            for(const texture of [common.texture!,common.detailTexture!,common.interfaceTexture!])for(let i=0;i<16;i++){const f=new SpriteFrame();f.texture=texture;f.setRect(new Rect(i%4*texture.width/4,Math.floor(i/4)*texture.height/4,texture.width/4,texture.height/4));f.packable=false;this.frames.push(f);}
            this.monsterFrames=groups.get('monsters')!.manifest.frames as Record<string,number>;
            this.buildingFrames=common.manifest.buildings as Record<string,number>;
            const data=config.json as GameConfig;
            if(!data.monsters.every(m=>this.monsterFrames[m.id]!==undefined)||!data.survival.buildings.every(b=>this.buildingFrames[b.id]!==undefined))throw new Error('部分怪物或建筑缺少必要图像');
            this.sounds=common.audio||{};this.seasonColors=groups.get('seasons')!.manifest.ground as string[];
            const heroes=groups.get('heroes')!.manifest;this.heroFrames={warden:heroes.warden as number[],hunter:heroes.hunter as number[]};
            console.info('内容加载完成（毫秒）',JSON.stringify(this.content.timings));return config.json;
        });
        input.on(Input.EventType.KEY_DOWN,this.keyDown,this);input.on(Input.EventType.KEY_UP,this.keyUp,this);input.on(Input.EventType.TOUCH_START,this.observeInput,this);
        this.unsubscribe=watchLifecycle(()=>{
            this.background=true;this.reportInput('hide',{});if(this.performanceProbe)this.performanceInterrupted=true;this.performanceLastFrame=0;this.clearInput();this.session?.pause('background');if(this.session)void this.session.save();
        },()=>{this.background=false;this.reportInput('show',{});this.performanceLastFrame=0;this.clearInput();this.session?.resume('background');});
        void this.load();
    }
    onDestroy():void{input.off(Input.EventType.KEY_DOWN,this.keyDown,this);input.off(Input.EventType.KEY_UP,this.keyUp,this);input.off(Input.EventType.TOUCH_START,this.observeInput,this);this.diagnostics?.dispose();this.unsubscribe?.();this.clearSpritePool();this.frames.forEach(f=>f.destroy());this.frames=[];this.configAsset?.decRef();this.configAsset=null;this.content.dispose();}
    private reportInput(kind:string,value:Record<string,unknown>):void {
        if(kind!=='device'&&!this.diagnostics?.enabled)return;
        if(kind==='raw'||kind==='engine'||kind==='button')this.diagnosticCounts[kind]++;
        const text=`输入：原始 ${this.diagnosticCounts.raw} / 引擎 ${this.diagnosticCounts.engine} / 按钮 ${this.diagnosticCounts.button} · 后台 ${this.background?'是':'否'} · ${kind} ${JSON.stringify(value)}`;
        this.diagnosticText=text;console.info('INPUT_DIAGNOSTIC',text);if(this.diagnosticLabel?.isValid)this.diagnosticLabel.string=text;
    }
    private observeInput(event:EventTouch):void {if(!this.diagnostics?.enabled)return;const p=event.getUILocation();this.reportInput('engine',{x:Math.round(p.x),y:Math.round(p.y)});}
    private ui(name:string,parent:Node,x:number,y:number,width:number,height:number):Node {
        const n=new Node(name);n.layer=Layers.Enum.UI_2D;parent.addChild(n);n.setPosition(x,y);n.addComponent(UITransform).setContentSize(width,height);return n;
    }
    private fitSafeArea():void {
        const t=this.safeRoot.getComponent(UITransform)!;
        if(t.width<=0||t.height<=0)return;
        const signature=`${t.width}:${t.height}:${t.anchorPoint.x}:${t.anchorPoint.y}`;if(signature===this.safeSignature)return;
        this.safeSignature=signature;const fit=safeLayout(t.width,t.height,t.anchorPoint.x,t.anchorPoint.y);
        this.screenRoot.setPosition(fit.x,fit.y);this.screenRoot.setScale(fit.scale,fit.scale,1);
    }
    private label(text:string,x:number,y:number,size=20,tint=C.white,width=1100,height=size*2.7):Label {
        const n=this.ui(text.slice(0,16),this.screenRoot,x,y,width,height),l=n.addComponent(Label);
        l.string=text;l.fontSize=size;l.lineHeight=size*1.4;l.color=color(tint);return l;
    }
    private button(text:string,x:number,y:number,width:number,start:(event:EventTouch)=>void,end?:(event:EventTouch)=>void,tint=C.forest,height=54):Node {
        const n=this.ui(text,this.screenRoot,x,y,width,height),g=n.addComponent(Graphics);
        const radius=Math.min(15,height/3);
        g.fillColor=color(C.shadow);g.roundRect(-width/2,-height/2-3,width,height,radius);g.fill();
        g.fillColor=color(tint);g.roundRect(-width/2,-height/2,width,height,radius);g.fill();g.strokeColor=color(C.edge);g.lineWidth=1.5;g.stroke();
        const l=this.ui('Label',n,0,1,width-8,height).addComponent(Label);l.string=text;l.fontSize=19;l.isBold=true;l.lineHeight=27;l.color=color(C.white);
        n.on(Node.EventType.TOUCH_START,(e:EventTouch)=>{e.propagationStopped=true;this.reportInput('button',{text});start(e);});
        if(end){n.on(Node.EventType.TOUCH_END,end);n.on(Node.EventType.TOUCH_CANCEL,end);}return n;
    }
    private clearScreen():void{this.diagnosticLabel=null;this.clearSpritePool();for(const n of [...this.screenRoot.children])n.destroy();this.screenRoot.removeAllChildren();}
    private clearSpritePool():void{for(const n of this.sprites.values())n.destroy();for(const n of this.spritePool)n.destroy();this.sprites.clear();this.spritePool=[];for(const entry of this.defenseNodes.values())entry.node.destroy();this.defenseNodes.clear();}
    private illustration(name:string,index:number,x:number,y:number,size:number):void {
        if(!this.frames[index])return;
        const sprite=this.ui(name,this.screenRoot,x,y,size,size).addComponent(Sprite);sprite.sizeMode=Sprite.SizeMode.CUSTOM;sprite.spriteFrame=this.frames[index];
    }
    private card(name:string,x:number,y:number,width:number,height:number,tint:string,radius=18):Graphics {
        const g=this.ui(name,this.screenRoot,x,y,width,height).addComponent(Graphics);
        g.fillColor=color(tint);g.roundRect(-width/2,-height/2,width,height,radius);g.fill();
        return g;
    }
    private section(text:string,x:number,y:number,width:number,size=20,tint=C.white):Label {
        const label=this.label(text,x,y,size,tint,width,size*1.5);
        label.isBold=true;label.overflow=Label.Overflow.SHRINK;
        return label;
    }
    private meter(name:string,index:number,x:number,y:number,width:number,tint:string,background=C.paper):Meter {
        this.card(name,x,y,width,56,background,13);this.illustration(name,index,x-width/2+22,y+4,34);
        const caption=this.section('',x+15,y+9,width-38,15);
        const trackWidth=width-46,track=this.card(`${name}数值`,x+15,y-13,trackWidth,8,'#E2E3D5',4);
        let previous=-1;
        return (value,max,text)=>{
            if(caption.string!==text)caption.string=text;
            const amount=Math.round(trackWidth*Math.min(1,Math.max(0,max>0?value/max:1)));
            if(amount===previous)return;previous=amount;
            track.clear();track.fillColor=color('#E2E3D5');track.roundRect(-trackWidth/2,-4,trackWidth,8,4);track.fill();
            if(amount){track.fillColor=color(tint);track.roundRect(-trackWidth/2,-4,amount,8,Math.min(4,amount/2));track.fill();}
        };
    }
    private actionTile(name:string,index:number|null,key:string,x:number,y:number,width:number,tint:string,start:(event:EventTouch)=>void,end?:(event:EventTouch)=>void):ActionTile {
        const plate=this.card(name,x,y,width,58,tint,15);
        plate.node.on(Node.EventType.TOUCH_START,(event:EventTouch)=>{event.propagationStopped=true;start(event);});
        if(end){plate.node.on(Node.EventType.TOUCH_END,end);plate.node.on(Node.EventType.TOUCH_CANCEL,end);}
        const outline=color(C.edge),fill=color(tint),disabled=color('#E8E9DC'),shade=color('#B7C6BC');
        const iconX=x-width/2+26;
        if(index===null){
            const lock=this.card('技能未习得',iconX,y-4,23,17,'#909D8F',4);
            lock.strokeColor=color('#909D8F');lock.lineWidth=4;lock.arc(0,7,7,0,Math.PI,false);lock.stroke();
            lock.fillColor=color(C.paper);lock.circle(0,0,2);lock.fill();
        }else this.illustration(name,index,iconX,y,42);
        this.section(`${name} · ${key}`,x+21,y+11,width-49,17);
        const status=this.section('',x+21,y-11,width-49,14,C.mist);
        let previousFill=-1,previousAvailable:boolean|undefined;
        return (text,fraction=0,available=true)=>{
            if(status.string!==text)status.string=text;
            const remaining=Math.round(46*Math.min(1,Math.max(0,fraction)));
            if(remaining===previousFill&&available===previousAvailable)return;
            previousFill=remaining;previousAvailable=available;
            plate.clear();plate.fillColor=available?fill:disabled;plate.roundRect(-width/2,-29,width,58,15);plate.fill();
            plate.strokeColor=outline;plate.lineWidth=1.5;plate.roundRect(-width/2,-29,width,58,15);plate.stroke();
            if(remaining){plate.fillColor=shade;plate.roundRect(-width/2+4,-23,44,remaining,Math.min(7,remaining/2));plate.fill();}
        };
    }
    private backdrop(title:string,subtitle=''):void {
        this.clearScreen();const g=this.ui('Backdrop',this.screenRoot,0,0,1280,720).addComponent(Graphics);
        const menu=this.mode==='menu';
        g.fillColor=color(menu?C.sky:C.ink);g.rect(-640,-360,1280,720);g.fill();
        g.fillColor=color(menu?'#C9E8A7':'#E8F2CC');g.ellipse(-410,-350,785,157);g.ellipse(390,-354,718,198);g.fill();
        if(menu){
            g.fillColor=color('#FFEDAA');g.circle(460,226,64);g.fill();
            g.fillColor=color('#F5FBFF');g.ellipse(-440,233,99,25);g.ellipse(-421,249,56,31);g.ellipse(300,171,75,22);g.fill();
            g.fillColor=color(C.paper);g.roundRect(-315,-240,630,570,32);g.fill();
            this.illustration('CampTree',8,-447,-97,244);this.illustration('CampTower',12,444,-48,238);
            this.illustration('CampGuardian',0,-490,-217,163);this.illustration('CampMonster',17,471,-215,154);
        }
        this.label(title,0,278,menu?53:34,C.white).isBold=true;this.label(subtitle,0,219,20,C.mist);
    }
    private async load():Promise<void>{
        if(this.loading)return;this.loading=true;this.mode='loading';this.backdrop('正在进入林地…');
        const state=await this.boot.retry();this.loading=false;if(!this.isValid)return;
        if(state.kind==='error'){this.frames.forEach(f=>f.destroy());this.frames=[];this.content.dispose();this.failure('资源加载失败',state.message,()=>{void this.load();});return;}
        if(state.kind!=='ready')return;this.config=this.localQaMode==='performance-long'?sustainedLoadConfig(state.config):state.config;
        try{
            const storage=this.performanceEnabled||['seasons','interface','defense'].includes(this.localQaMode??'')?new PlaytestStorage():this.localQaMode==='outcomes'?outcomeStorage(localStoragePort()):localStoragePort();
            this.store=new SaveStore(storage,runValidator(this.config));const loaded=await this.store.load();
            this.saved=loaded.value;this.menu(loaded.warning||'');
        }catch(error){this.failure('无法读取本地进度',String(error),()=>{void this.load();});}
    }
    private failure(title:string,detail:string,retry:()=>void):void{this.mode='error';this.backdrop(title,'已有存档会保留。');this.label(detail,0,40,19,C.red,1100,160);this.button('重试',0,-100,220,retry);}
    private menu(warning=''):void{
        this.mode='menu';this.backdrop('暮野危机','白昼筹谋，守住长夜。');
        this.label('生存守塔 · 本地试玩',0,122,25);
        this.button(this.saved?(this.saved.ended?'查看上局结算':'继续游戏'):'继续游戏 · 暂无存档',0,40,300,()=>{if(this.saved)this.beginRun(this.saved);},undefined,this.saved?C.forest:'#EBEBD8');
        this.button('新的旅程',0,-36,300,()=>this.newGame(),undefined,C.primary);
        this.button('玩法手册 · H',-454,76,190,()=>this.openHelp(),undefined,C.peach,44);
        this.label('白天采集与制造，夜晚保护营地塔。\n死亡后可复活；穿戴装备逐件判定永久消失。',0,-149,20,C.mist,1000,90);
        this.label(warning||'Enter 继续 / N 新建 · 单机进度保存在当前设备',0,-292,17,warning?C.red:C.mist);
        if(this.diagnostics?.enabled)this.diagnosticLabel=this.label(this.diagnosticText||'输入诊断已就绪',0,-330,12,C.mist,1200,26);
        if(this.resourceProbeEnabled&&!this.resourceProbeRunning)this.button('本地资源验证',-450,-280,200,()=>{void this.probeResources();},undefined,C.forest,42);
        if(this.localQaMode==='seasons'){
            this.button('四季常速验证',-450,-280,200,()=>this.startSeasonSample(),undefined,C.forest,42);
            this.label('开发样本：7 段各 30 秒，途中自动存取；仅内存存档，刷新即清空。',0,-237,16,C.gold);
        }
        if(this.localQaMode==='outcomes'){
            this.label('开发样本：预设装备与低生命；独立测试存档，可刷新恢复。',0,-211,16,C.gold);
            this.button('重置为死亡样本',-200,-251,290,()=>this.beginOutcome('death'),undefined,C.forest,42);
            this.button('重置为塔毁样本',200,-251,290,()=>this.beginOutcome('tower'),undefined,C.forest,42);
        }
        if(this.performanceEnabled){
            const long=this.localQaMode==='performance-long';
            this.label(long?'长测样本：延长黑夜、提高测试塔耐久，独立内存存档。':'开发负载：敌人属性不变；测试塔耐久提高，独立内存存档。',0,-211,16,C.gold);
            this.button(`${long?'30 分钟':'60 秒'}敌人压力观测`,0,-251,340,()=>this.startPerformanceProbe(),undefined,C.forest,42);
        }
        if(this.localQaMode==='interface'){
            this.label('界面样本：已有装备、材料与训练名额；临时进度，不写正式存档。',0,-215,16,C.gold);
            this.button('进入界面样本',0,-254,250,()=>this.beginRun(interfaceCheckpoint(this.config!)),undefined,C.primary,42);
        }
        if(this.localQaMode==='defense'){
            this.label('围墙样本：闭合营地、侧向门与混合墙材；仅临时进度。',0,-215,16,C.gold);
            this.button('进入围墙样本',0,-254,250,()=>this.beginRun(defenseCheckpoint(this.config!)),undefined,C.primary,42);
        }
    }
    private openHelp():void {
        if(!this.config)return;
        this.guideReturn=this.session?'pause':'menu';this.guidePage=0;
        this.session?.pause('menu');this.performanceLastFrame=0;this.clearInput();this.renderHelp();
    }
    private renderHelp():void {
        const pages=playGuide(this.config!),page=pages[this.guidePage];this.mode='help';
        this.backdrop(`林地手册 · ${this.guidePage+1}/${pages.length}`,page.title);
        const body=this.label(page.body,0,15,20,C.white,1100,350);body.overflow=Label.Overflow.CLAMP;body.enableWrapText=true;
        this.button('上一页',-180,-253,220,()=>{this.guidePage=(this.guidePage+pages.length-1)%pages.length;this.renderHelp();});
        this.button('下一页',180,-253,220,()=>{this.guidePage=(this.guidePage+1)%pages.length;this.renderHelp();});
        this.button(this.guideReturn==='menu'?'返回菜单':'返回暂停',0,-320,240,()=>this.closeHelp(),undefined,C.forest,42);
    }
    private closeHelp():void{if(this.guideReturn==='pause'&&this.session)this.pauseMenu();else this.menu();}
    private startPerformanceProbe():void {
        if(!this.performanceEnabled||!this.config||this.background)return;
        this.store=new SaveStore(new PlaytestStorage(),runValidator(this.config));
        const state=performanceCheckpoint(this.config);this.performanceStartTime=state.time;
        this.performanceProbe=new FrameObservation();this.performanceInterrupted=false;this.performanceLastFrame=0;this.performanceStarted=performance.now();this.beginRun(state);
    }
    private observePerformance(delta:number,work:number):void {
        const probe=this.performanceProbe,s=this.session;if(!probe||!s)return;
        const memory=(performance as Performance&{memory?:{usedJSHeapSize:number}}).memory;
        probe.add({delta,work,enemies:s.run.battle.enemies.filter(e=>e.health>0).length,sprites:this.sprites.size+this.spritePool.length,assets:assetManager.assets.count,heap:memory?.usedJSHeapSize??null});
        this.hint.string=`本地负载 · ${s.run.battle.enemies.length} 敌人 · ${probe.elapsed.toFixed(1)}/${this.performanceDuration}s · 当前帧 ${(delta*1000).toFixed(1)}ms · 临时进度`;
        if(probe.elapsed<this.performanceDuration)return;
        s.pause('menu');this.clearInput();
        const wallSeconds=(performance.now()-this.performanceStarted)/1000;
        const result={...probe.result(),targetSeconds:this.performanceDuration,wallSeconds,continuous:!this.performanceInterrupted&&wallSeconds-probe.elapsed<2,simulationSeconds:s.run.state.time-this.performanceStartTime};
        this.performanceProbe=null;this.session=null;this.saved=null;this.mode='qa';
        this.backdrop('敌人压力观测',result.continuous?'请结合设备、运行模式与原生内存记录核对。':'本次前台运行中断，需重新采样。');
        this.label(`活动敌人 ${result.minEnemies}～${result.maxEnemies} · 平均 ${result.fps.toFixed(1)} FPS\n帧间隔 P95 ${result.frameP95.toFixed(2)}ms / P99 ${result.frameP99.toFixed(2)}ms`,0,116,24,C.white,1120,100);
        this.label(`逻辑与绘制提交 P95 ${result.workP95.toFixed(2)}ms\n渲染帧累计 ${result.seconds.toFixed(1)}s · 实耗 ${result.wallSeconds.toFixed(1)}s · 世界推进 ${result.simulationSeconds.toFixed(1)}s`,0,8,20,C.mist,1120,100);
        this.label(`精灵节点峰值 ${result.sprites} · 资产缓存 ${result.assets}\n可用 JS 堆样本峰值 ${result.heapPeak===null?'浏览器未提供':(result.heapPeak/1048576).toFixed(2)+' MiB'}`,0,-103,20,C.mist,1120,90);
        this.label('JS 堆不含全部 GPU／原生内存；提交耗时不等于 GPU 完成耗时。',0,-200,16,C.gold);
        this.button('返回菜单',0,-279,240,()=>this.menu());
        console.info('PERFORMANCE_PROBE',JSON.stringify(result));
    }
    private beginOutcome(kind:'death'|'tower'):void {
        if(this.localQaMode!=='outcomes'||!this.config||this.background)return;
        this.seasonProbe=null;this.outcomeProbe=kind==='death'?'death':null;this.newGameGate.cancel();this.beginRun(outcomeCheckpoint(this.config,kind));
    }
    private startSeasonSample():void {
        if(this.localQaMode!=='seasons'||!this.config||this.background)return;
        if(!this.seasonProbe)this.seasonProbe={index:0,time:0,wall:0,restored:false,busy:false,results:[]};
        const probe=this.seasonProbe;
        this.store=new SaveStore(new PlaytestStorage(),runValidator(this.config));
        const state=seasonCheckpoint(this.config,SEASON_SAMPLES[probe.index]);
        probe.time=state.time;probe.wall=performance.now();probe.restored=false;probe.busy=false;
        this.beginRun(state);
    }
    private async stepSeasonProbe():Promise<void> {
        const probe=this.seasonProbe,s=this.session;if(!probe||!s||probe.busy)return;
        const elapsed=s.run.state.time-probe.time;
        if(elapsed<(probe.restored?30:15))return;
        probe.busy=true;s.pause('menu');this.clearInput();
        try{
            if(!await s.save())throw new Error(s.error||'临时样本保存失败');
            const expected=s.run.snapshot(),loaded=await s.store.load();
            if(!loaded.value||JSON.stringify(expected)!==JSON.stringify(loaded.value))throw new Error('临时样本存档恢复不一致');
            const restored=new SurvivalRun(this.config!,42,loaded.value);
            if(JSON.stringify(restored.snapshot())!==JSON.stringify(expected))throw new Error('恢复世界后样本状态不一致');
            if(!probe.restored){
                this.session=new Session(restored,s.store);probe.restored=true;probe.busy=false;this.play();return;
            }
            const r=restored,sample=SEASON_SAMPLES[probe.index];
            const fuel=r.state.buildings.find(b=>b.fuelUntil)?.fuelUntil;
            const line=`${sample.name}：${elapsed.toFixed(1)}s / 实耗 ${((performance.now()-probe.wall)/1000).toFixed(1)}s · HP ${Math.ceil(r.battle.player.health)} · ${r.environment.temperature.toFixed(1)}° · ${r.calendar.year}年${r.calendar.day}天${r.calendar.phase==='day'?'昼':r.calendar.phase==='dusk'?'暮':'夜'}${fuel?` · 燃料 ${(fuel-r.state.time).toFixed(0)}s`:''} · 存取一致`;
            probe.results.push(line);console.info('SEASON_PROBE',line,JSON.stringify({environment:r.environment,tower:r.tower.health,deaths:r.state.stats.deaths}));
            probe.index++;this.session=null;
            if(probe.index<SEASON_SAMPLES.length){this.startSeasonSample();return;}
            this.mode='qa';this.backdrop('四季正常速度样本完成','1×运行，15 秒存档重建世界，30 秒再次校验；正式存档未访问。');
            probe.results.forEach((line,i)=>this.label(line,0,157-i*43,16,C.mist,1210));
            this.label('隔离样本移除了初始野怪并耗尽初始夜袭预算；不代表完整生存一年或手机验收。',0,-184,16,C.gold);
            this.button('返回菜单',0,-264,240,()=>{this.seasonProbe=null;this.saved=null;this.menu();});
        }catch(error){this.seasonProbe=null;this.session=null;this.failure('四季样本未通过',String(error),()=>this.menu());}
    }
    private async probeResources():Promise<void> {
        if(!this.resourceProbeEnabled||this.resourceProbeRunning||this.session||this.loading)return;
        this.resourceProbeRunning=true;
        const samples:{assets:number;heap:number|null;milliseconds:number}[]=[];
        const sample=(milliseconds:number)=>{const memory=(performance as Performance&{memory?:{usedJSHeapSize:number}}).memory;samples.push({assets:assetManager.assets.count,heap:memory?.usedJSHeapSize??null,milliseconds});};
        try{
            sample(0);
            for(let i=0;i<3;i++){
                const start=performance.now();await this.load();
                if(this.mode==='error')throw new Error('资源重载失败，请恢复资源后重试');
                await new Promise<void>(resolve=>this.scheduleOnce(resolve,.25));
                sample(Math.round(performance.now()-start));
            }
            this.mode='qa';this.backdrop('本地资源重载观测','同一页面重载三次；读取存档，不创建新局、不写入存档。');
            samples.forEach((s,i)=>this.label(`${i===0?'重载前':`第 ${i} 次`}：缓存资产 ${s.assets} · JS 堆 ${s.heap===null?'浏览器未提供':(s.heap/1048576).toFixed(2)+' MiB'} · ${s.milliseconds} ms`,0,120-i*60,20,C.mist));
            this.label('JS 堆可能为粗粒度样本，包含垃圾回收波动；不是手机峰值内存或稳定性结论。',0,-168,17,C.gold);
            this.button('返回菜单',0,-255,240,()=>this.menu());
            console.info('RESOURCE_PROBE',JSON.stringify(samples));
        }catch(error){this.failure('资源观测未完成',String(error),()=>{this.resourceProbeRunning=false;void this.load();});}
        finally{this.resourceProbeRunning=false;}
    }
    private newGame():void {
        if(this.background||this.session?.saving||this.session?.error)return;
        this.session?.pause('menu');this.clearInput();
        if(!this.newGameGate.request(Boolean(this.saved||this.session))){
            this.mode='confirm';this.backdrop('开启新的旅程？','新的存档会替换当前旅程；取消可保留原进度。');
            this.button('保留原局',-160,-30,240,()=>this.cancelNewGame());
            this.button('确认新建',160,-30,240,()=>{if(!this.background&&this.newGameGate.confirm())this.beginRun();},undefined,'#FFCCBA');
        }else this.beginRun();
    }
    private cancelNewGame():void{
        this.newGameGate.cancel();
        if(this.session){if(this.session.run.state.ended)this.result();else this.play();}else this.menu();
    }
    private beginRun(saved?:RunState,hero?:string):void{
        if(!this.config||!this.store||this.background)return;
        if(!saved&&!hero){this.chooseHero();return;}
        const run=new SurvivalRun(this.config,(Date.now()>>>0),saved,hero);this.session=new Session(run,this.store);this.speed=1;
        this.castEffect=null;this.bagTab=run.state.inventory.equipment.length?'gear':'craft';this.bagSelected=null;
        this.bagPages={gear:0,materials:0,craft:0,tools:0};
        this.lastAudio={health:run.battle.player.health,gathered:run.state.stats.gathered,deaths:run.state.stats.deaths,phase:run.calendar.phase};
        if(this.background)this.session.pause('background');
        if(run.state.ended){this.result();return;}
        void this.session.save();this.play();
    }
    private chooseHero():void {
        this.mode='hero';this.backdrop('选择同行者','角色在本局内固定，死亡复活保留成长。');
        const c=this.config!;
        this.card('WardenCard',-280,-22,500,392,'#E9F6D9');this.card('HunterCard',280,-22,500,392,'#FFE9CF');
        this.illustration('WardenPortrait',0,-280,94,166);this.illustration('HunterPortrait',4,280,94,166);
        this.label(c.characters.find(hero=>hero.id==='warden')!.name,-280,3,29,C.white,440).isBold=true;
        this.label(`伐木耗时 ×${c.growth.wardenLoggingTime}\n每 ${c.growth.wardenFreeRepairEvery} 次修墙免一次材料`,-280,-63,20,C.mist,450,84);
        this.label(c.characters.find(hero=>hero.id==='hunter')!.name,280,3,29,C.white,440).isBold=true;
        this.label(`完美格挡后下一击 +${c.growth.hunterCounterBonus*100}%\n闪现后 ${c.growth.hunterBlinkSeconds} 秒攻击 +${c.growth.hunterBlinkBonus*100}%`,280,-63,20,C.mist,450,84);
        this.button('选择守望者 · 1',-280,-159,270,()=>this.beginRun(undefined,'warden'),undefined,C.primary);
        this.button('选择猎手 · 2',280,-159,270,()=>this.beginRun(undefined,'hunter'),undefined,C.peach);
        this.button('保留原局 / 返回',0,-273,250,()=>this.cancelNewGame());
    }
    private play():void {
        const s=this.session;if(!s)return;this.mode='play';this.placement=null;this.placementCell=null;this.placementTouch=null;this.clearScreen();this.clearInput();s.resume('menu');
        const viewport=this.ui('WorldViewport',this.screenRoot,0,0,1280,720);viewport.addComponent(Mask).type=Mask.Type.GRAPHICS_RECT;
        this.terrain=this.ui('Terrain',viewport,0,0,1280,720).addComponent(Graphics);this.terrainPlayer=null;
        const n=this.ui('World',viewport,0,0,1280,720);this.world=n.addComponent(Graphics);
        this.effects=this.ui('WorldEffects',viewport,0,0,1280,720).addComponent(Graphics);
        const pointCell=(e:EventTouch)=>{
            const p=e.getUILocation(),local=n.getComponent(UITransform)!.convertToNodeSpaceAR(new Vec3(p.x,p.y,0)),camera=s.run.battle.player.position;
            return s.run.world.grid.cellAt({x:local.x+camera.x,y:local.y+camera.y});
        };
        n.on(Node.EventType.TOUCH_START,(e:EventTouch)=>{
            if(!this.placement||this.placementTouch!==null)return;
            this.placementTouch=e.getID();this.placementCell=pointCell(e);
        });
        n.on(Node.EventType.TOUCH_MOVE,(e:EventTouch)=>{if(e.getID()===this.placementTouch)this.placementCell=pointCell(e);});
        n.on(Node.EventType.TOUCH_END,(e:EventTouch)=>{
            if(e.getID()!==this.placementTouch)return;this.placementTouch=null;
            const cell=pointCell(e),kind=this.placement;this.placementCell=null;if(!cell||!kind)return;
            s.command(()=>kind==='tower'?s.run.relocate(cell):s.run.build(cell,kind));
            if(kind==='tower'&&s.run.channel){this.placement=null;this.placementExit!.active=false;}
        });
        n.on(Node.EventType.TOUCH_CANCEL,(e:EventTouch)=>{if(e.getID()===this.placementTouch){this.placementTouch=null;this.placementCell=null;}});
        const panel=this.ui('HudBackdrop',this.screenRoot,0,292,1280,136).addComponent(Graphics);panel.fillColor=color(C.paper);panel.rect(-640,-68,1280,136);panel.fill();
        panel.fillColor=color(C.shadow);panel.rect(-640,-69,1280,3);panel.fill();
        this.renderFieldStatus(s.run);
        this.message=this.section('',25,238,895,16,C.gold);
        this.button('背包 · I',550,323,132,()=>this.openBag(),undefined,C.primary,44);
        this.button('暂停',550,270,132,()=>this.pauseMenu(),undefined,C.forest,41);
        this.button('采集 E',-205,-276,130,()=>s.command(()=>s.run.interact()));
        this.button('木墙 B',-60,-276,130,()=>this.place('wall'));
        this.button('木门',85,-276,130,()=>this.place('gate'));
        this.placementExit=this.button('完成建造',230,-210,130,()=>{if(this.placement)this.place(this.placement);},undefined,C.primary,42);
        this.placementExit.active=false;
        this.button('迁塔 T',-205,-339,130,()=>this.place('tower'),undefined,C.forest,42);
        this.button('维修 R',-60,-339,130,()=>s.command(()=>s.run.repair()),undefined,C.forest,42);
        this.button('拆除 X',85,-339,130,()=>s.command(()=>s.run.demolish()),undefined,C.forest,42);
        this.button('进阶防线',230,-339,130,()=>this.defenseMenu(),undefined,C.forest,42);
        this.actionTiles=[
            this.actionTile('平 A',icons.weapon,'J',485,-276,174,C.peach,e=>this.pressAttack(e.getID()??'pointer'),e=>this.heldAttack.release(e.getID()??'pointer')),
            this.actionTile('闪现',icons.blink,'K',300,-284,162,C.sky,()=>this.blink()),
            this.actionTile('格挡',icons.shield,'L',485,-199,174,C.sky,e=>this.pressBlock(e.getID()??'pointer'),e=>this.releaseBlock(e.getID()??'pointer')),
        ];
        for (let i=0;i<2;i++) {
            const skill=s.run.config.skills.find(definition=>definition.id===s.run.skills.learned[i]);
            this.actionTiles.push(this.actionTile(skill?.name??'技能槽',skill?icons[skill.id]:null,`${i+1}`,310+i*175,-124,166,skill?skillStyle[skill.id].fill:C.forest,()=>this.cast(i)));
        }
        this.card('FieldTips',-66,-195,445,77,C.paper,13);
        this.hint=this.label('',-66,-195,15,C.mist,431,76);
        this.hint.overflow=Label.Overflow.SHRINK;
        const stick=this.ui('Joystick',this.screenRoot,-460,-253,180,180),g=stick.addComponent(Graphics);
        const ring=color(C.paper);ring.a=221;g.fillColor=ring;g.circle(0,0,72);g.fill();g.strokeColor=color(C.edge);g.lineWidth=2;g.circle(0,0,72);g.stroke();g.fillColor=color(C.primary);g.circle(0,0,27);g.fill();
        stick.on(Node.EventType.TOUCH_START,(e:EventTouch)=>{e.propagationStopped=true;if(this.moveTouch!==null||s.fixed.paused)return;this.moveTouch=e.getID();const p=e.getUILocation();this.touchOrigin={x:p.x,y:p.y};});
        stick.on(Node.EventType.TOUCH_MOVE,(e:EventTouch)=>{if(e.getID()!==this.moveTouch)return;const p=e.getUILocation();this.joystick={x:p.x-this.touchOrigin.x,y:p.y-this.touchOrigin.y};});
        const stop=(e:EventTouch)=>{if(e.getID()===this.moveTouch){this.moveTouch=null;this.joystick={x:0,y:0};}};
        stick.on(Node.EventType.TOUCH_END,stop);stick.on(Node.EventType.TOUCH_CANCEL,stop);
        this.card('JoystickLabel',-460,-342,138,26,C.paper,10);this.label('WASD / 摇杆',-460,-342,16,C.mist,138);this.draw();
    }
    private renderFieldStatus(run:SurvivalRun):void {
        this.card('人物状态',-485,296,260,103,'#E8F1D8',17);
        this.illustration('人物头像',this.heroFrames[run.progression.hero][0],-574,295,80);
        this.hudIdentity=this.section('',-452,323,168,19);
        this.hudMeters={
            xp:this.meter('战斗经验',icons.stamina,-452,280,166,meterColors.xp,'#E8F1D8'),
            health:this.meter('生命',icons.heart,-270,316,150,meterColors.health,'#FBE6DF'),
            stamina:this.meter('体力',icons.stamina,-110,316,150,meterColors.stamina,'#FAF0CF'),
            food:this.meter('饥饿',icons.food,50,316,150,meterColors.food,'#EAF0D7'),
            tower:this.meter('营地塔',icons.tower,366,316,176,meterColors.tower,'#F5E9D0'),
        };
        this.card('体温',205,316,140,56,'#E1F0F7',13);this.illustration('体温',icons.temperature,158,318,34);
        this.hudTemperature=this.section('',222,318,95,16);
        this.hudClock=this.section('',23,265,495,17,C.mist);
        this.hudTowerRange=this.section('',369,266,172,15,C.mist);
        const target=this.ui('人物详情',this.screenRoot,-485,296,260,103);
        target.on(Node.EventType.TOUCH_START,(event:EventTouch)=>{event.propagationStopped=true;this.openCharacter('play');});
    }
    private place(kind:BuildingKind):void{
        if(!this.session?.commandsAllowed||this.session.fixed.paused)return;
        this.placement=this.placement===kind?null:kind;
        this.placementCell=null;this.placementTouch=null;if(this.placementExit)this.placementExit.active=!!this.placement;
        const def=this.session.run.config.survival.buildings.find(b=>b.id===kind)!;
        this.session.run.message=this.placement?(kind==='tower'?'点击附近空地迁塔：白天引导 8 秒，消耗 5 木 3 石。':`${def.name}：${def.costs.map(c=>`${this.config!.materials.find(m=>m.id===c.id)?.name}×${c.count}`).join(' ')}；按住预览，松手放置。相邻墙自动连接，点“完成建造”退出。`) : '已退出放置。';
    }
    private defenseMenu():void {
        const s=this.session;if(!s||!s.commandsAllowed)return;this.mode='defense';s.pause('menu');this.clearInput();
        this.backdrop('修筑防线','放置时世界继续推进；升级保留原墙生命比例。');
        s.run.config.survival.buildings.filter(b=>b.id!=='tower').forEach((b,i)=>{
            const x=i%2===0?-295:295,y=135-Math.floor(i/2)*125,cost=b.costs.map(m=>`${this.config!.materials.find(d=>d.id===m.id)?.name}×${m.count}`).join(' ');
            this.label(`${b.name} · 生命 ${b.health}\n${cost}`,x,y,18,C.mist,550,65);
            this.button('选择放置',x,y-48,220,()=>{this.play();this.place(b.id);},undefined,C.forest,38);
        });
        this.button('升级附近围墙',-360,-272,260,()=>{s.resume('menu');s.command(()=>s.run.upgradeWall());this.play();});
        this.button('补充附近设施燃料',0,-272,300,()=>{s.resume('menu');s.command(()=>s.run.fuelFacility());this.play();});
        this.button('返回',360,-272,220,()=>this.play());
    }
    private pauseMenu():void{
        const s=this.session;if(!s||!s.commandsAllowed)return;this.mode='pause';this.performanceLastFrame=0;s.pause('menu');this.clearInput();void s.save();
        this.backdrop('林地已暂停','世界时间、饥饿和夜袭都会暂停。');
        this.button('继续旅程',0,98,260,()=>this.play());
        this.button('玩法手册 · H',-400,98,240,()=>this.openHelp());
        this.button(`试玩速度 ×${this.speed}`,0,24,260,()=>{if(!this.seasonProbe&&!this.performanceProbe)this.speed=this.speed===1?4:1;this.pauseMenu();});
        this.button('保存并返回菜单',0,-50,260,()=>{void this.returnMenu();});
        this.button('新的旅程',0,-124,260,()=>this.newGame());
        this.button(`音效：${this.soundEnabled?'开':'关'}`,0,-198,260,()=>{this.soundEnabled=!this.soundEnabled;this.pauseMenu();});
        this.label('×4 用于快速体验昼夜；普通速度一天为 10 分钟。',0,-282,18,C.mist);
    }
    private async returnMenu():Promise<void>{
        const s=this.session;if(!s)return;if(!await s.save()){this.storageError();return;}
        this.saved=s.run.snapshot();this.session=null;this.seasonProbe=null;this.outcomeProbe=null;this.performanceProbe=null;this.menu('进度已保存。');
    }
    private itemName(definition:string):string{return this.config?.equipment.find(d=>d.id===definition)?.name||(definition==='emergency-weapon'?'应急木棍':definition);}
    private openBag():void{
        const s=this.session;if(!s||!s.commandsAllowed)return;this.mode='bag';s.pause('menu');this.clearInput();this.renderBag();
    }
    private manage(kind:'craft'|'equip'|'unequip'|'dismantle'|'food'|'emergency'|'upgrade-tool'|'learn',value=''):void{
        const s=this.session;if(!s)return;
        const slot=kind==='equip'?equipmentInfo(s.run.config,s.run.state.inventory.equipment.find(item=>item.id===value)?.definition??'').slot:null;
        const success=s.command(()=>s.run.manage(`ui-${++this.sequence}`,kind,value),true);
        if(success&&(kind==='craft'||kind==='emergency'||kind==='unequip')){
            const last=s.run.state.inventory.equipment.length-1;
            this.bagTab='gear';this.bagPages.gear=Math.max(0,Math.floor(last/bagPageSize));
            this.bagSelected=s.run.state.inventory.equipment[last]?.id??null;
        }else if(success&&slot)this.bagSelected=`worn-${slot}`;
        this.renderBag();
    }
    private renderBag():void {
        this.mode='bag';
        const s=this.session!;const r=s.run,bag=r.state.inventory;
        this.clearScreen();this.card('行囊背景',0,0,1280,720,'#F4E8CB',0);
        this.card('行囊标题栏',0,309,1224,73,C.paper,17);
        this.illustration('行囊',icons.bag,-562,310,57);this.section(`行囊  ${usedSlots(bag)}/${bag.capacity}`,-441,311,170,25);
        this.section(r.message||'世界已暂停',25,310,625,16,C.mist);
        this.button('返回 · I',537,310,120,()=>this.play(),undefined,C.forest,46);
        this.card('人物装备区',-448,-25,328,556,C.paper,20);
        this.card('物品网格区',-9,-25,526,556,C.paper,20);
        this.card('物品详情区',436,-25,344,556,C.paper,20);

        const worn:BagEntry[]=[];
        const spots=[[-548,91],[-548,-28],[-548,-147],[-348,-28],[-348,91]];
        this.section('人物装备',-448,215,290,24);
        this.illustration('装备人物',this.heroFrames[r.progression.hero][0],-447,8,164);
        this.section(`Lv.${r.level}`,-447,-85,96,19,C.mist);
        SLOTS.forEach((slot,index)=>{
            const item=bag.worn[slot],[x,y]=spots[index];
            const def=item?equipmentInfo(r.config,item.definition):null,key=`worn-${slot}`;
            if(item)worn.push({kind:'gear',key,item,slot});
            this.itemTile(x,y,88,103,icons[slot],def?.name??slotNames[slot],item?'已穿戴':'空',def?rarityStyle[def.rarity].fill:'#F2EFDF',this.bagSelected===key,()=>{
                if(item){this.bagSelected=key;this.renderBag();}
            });
        });
        this.button('人物详情 · P',-448,-216,173,()=>this.openCharacter('bag'),undefined,C.forest,38);
        this.section(`攻击 ${r.battle.config.attackDamage}    防御 ${r.battle.defense}`,-448,-252,295,17);
        this.section(`倒下时每件穿戴装备有 ${Math.round(r.config.world.deathLossRate*100)}% 概率丢失`,-448,-273,294,14,C.red);

        bagTabs.forEach((tab,index)=>this.button(bagTabNames[tab],-199+126*index,216,111,()=>{
            this.bagTab=tab;this.bagSelected=null;this.renderBag();
        },undefined,this.bagTab===tab?C.primary:'#EDEDDC',44));
        const entries=this.bagEntries(r),pages=Math.max(1,Math.ceil(entries.length/bagPageSize));
        const page=this.bagPages[this.bagTab]=Math.min(this.bagPages[this.bagTab],pages-1);
        const shown=entries.slice(page*bagPageSize,(page+1)*bagPageSize);
        const selected=[...shown,...worn].find(entry=>entry.key===this.bagSelected)??shown[0];
        this.bagSelected=selected?.key??null;
        for(let index=0;index<bagPageSize;index++){
            const x=-199+126*(index%4),y=127-121*Math.floor(index/4),entry=shown[index];
            if(!entry){this.card('空格位',x,y,112,108,'#F2EEDD',12);continue;}
            const info=this.entryAppearance(r,entry);
            this.itemTile(x,y,112,108,info.icon,info.name,info.badge,info.tint,selected===entry,()=>{this.bagSelected=entry.key;this.renderBag();});
        }
        if(!entries.length){
            this.card('行囊空状态',-9,12,420,120,C.paper,17);
            this.section('还没有装备',-9,36,360,23);
            this.button('去造第一把木剑',-9,-14,204,()=>{this.bagTab='craft';this.bagPages.craft=0;this.bagSelected=null;this.renderBag();},undefined,C.primary,43);
        }
        this.section(`${page+1} / ${pages}`,-9,-252,124,17,C.mist);
        if(pages>1){
            const goto=(next:number)=>{this.bagPages[this.bagTab]=next;this.bagSelected=null;this.renderBag();};
            if(page>0)this.button('上一页',-129,-252,108,()=>goto(page-1),undefined,C.forest,42);
            if(page+1<pages)this.button('下一页',111,-252,108,()=>goto(page+1),undefined,C.forest,42);
        }
        this.renderBagDetail(r,selected);
        this.button('营地训练',-448,-329,184,()=>this.renderTraining(),undefined,C.sky,40);
        if(r.state.stats.deaths>0)this.button('上次死亡损失',436,-329,205,()=>this.deathSummary(),undefined,C.peach,40);
        this.section('点选格子查看详情 · 世界已暂停',-9,-330,510,15,C.mist);
    }
    private bagEntries(run:SurvivalRun):BagEntry[] {
        if(this.bagTab==='gear')return run.state.inventory.equipment.map(item=>({kind:'gear',item,key:item.id}));
        if(this.bagTab==='materials')return run.config.materials.map(material=>({kind:'material',key:material.id,id:material.id}));
        if(this.bagTab==='tools')return [...supplies];
        const recipes=[...run.config.recipes].sort((left,right)=>Number(right.output==='basic-weapon')-Number(left.output==='basic-weapon'));
        return recipes.map(recipe=>({kind:'recipe',key:recipe.id,recipe}));
    }
    private entryAppearance(run:SurvivalRun,entry:BagEntry):{icon:number;name:string;badge:string;tint:string} {
        const bag=run.state.inventory;
        if(entry.kind==='tool')return {icon:entry.icon,name:entry.name,badge:'塔旁操作',tint:C.forest};
        if(entry.kind==='material')return {icon:materialIcon(entry.id),name:run.config.materials.find(material=>material.id===entry.id)!.name,badge:`×${bag.materials[entry.id]||0}`,tint:bag.materials[entry.id]?'#EAF2D9':'#F1EDE1'};
        const info=equipmentInfo(run.config,entry.kind==='gear'?entry.item.definition:entry.recipe.output),rarity=rarityStyle[info.rarity];
        return {icon:icons[info.slot],name:info.name,badge:entry.kind==='recipe'&&hasMaterials(bag,entry.recipe.materials)?'材料齐全':rarity.name,tint:rarity.fill};
    }
    private itemTile(x:number,y:number,width:number,height:number,index:number,name:string,badge:string,tint:string,selected:boolean,onSelect:()=>void):void {
        const border=this.card(name,x,y,width,height,tint,13);
        border.strokeColor=color(selected?'#57804B':'#D3CEAF');border.lineWidth=selected?3:1.4;
        border.roundRect(-width/2,-height/2,width,height,13);border.stroke();
        this.illustration(name,index,x,y+13,52);
        this.section(name,x,y-18,width-11,16);
        this.section(badge,x,y-38,width-11,13,C.mist);
        border.node.on(Node.EventType.TOUCH_START,(event:EventTouch)=>{event.propagationStopped=true;onSelect();});
    }
    private textBlock(text:string,x:number,y:number,width:number,height:number,size=17,tint=C.mist):void {
        const label=this.label(text,x,y,size,tint,width,height);label.enableWrapText=true;label.overflow=Label.Overflow.SHRINK;
    }
    private renderCosts(run:SurvivalRun,costs:readonly {id:string;count:number}[],top:number):void {
        costs.forEach((cost,index)=>{
            const y=top-index*32,have=run.state.inventory.materials[cost.id]||0;
            const name=run.config.materials.find(material=>material.id===cost.id)?.name??cost.id;
            this.illustration(name,materialIcon(cost.id),308,y,29);
            this.section(name,390,y,125,16);
            this.section(`${have} / ${cost.count}`,530,y,112,16,have>=cost.count?C.mist:C.red);
        });
    }
    private detailAction(text:string,callback:()=>void,available:boolean,y=-248):void {
        this.button(text,436,y,280,()=>{if(available)callback();},undefined,available?C.primary:'#E8E6D7',48);
    }
    private renderBagDetail(run:SurvivalRun,entry:BagEntry|undefined):void {
        if(!entry){this.section('物品详情',436,203,306,23);this.textBlock('从行囊里选一件物品查看。',436,48,277,126);return;}
        const info=this.entryAppearance(run,entry),bag=run.state.inventory;
        this.card('物品徽章',436,184,90,90,info.tint,19);
        this.illustration(info.name,info.icon,436,184,76);
        this.section(info.name,436,116,298,26);
        if(entry.kind==='gear'||entry.kind==='recipe'){
            const gear=equipmentInfo(run.config,entry.kind==='gear'?entry.item.definition:entry.recipe.output),rarity=rarityStyle[gear.rarity];
            this.section(`${rarity.name} · ${slotNames[gear.slot]}`,436,82,292,16,rarity.ink);
            this.section(`攻击 +${gear.attack}    防御 +${gear.defense}`,436,46,293,18);
            this.section(`保暖 +${statText(gear.warmth)}    隔热 +${statText(gear.cooling)}`,436,17,291,15,C.mist);
            if(entry.kind==='recipe'){
                const canCraft=run.editable&&run.nearTower&&craft(bag,run.config,entry.recipe.id)!==null;
                this.renderCosts(run,entry.recipe.materials,-25);
                const reason=!run.editable?'角色当前无法操作':!run.nearTower?'请靠近营地塔':!hasMaterials(bag,entry.recipe.materials)?'材料不足':!canCraft?'背包空间不足':'制造';
                this.detailAction(reason,()=>this.manage('craft',entry.recipe.id),canCraft);
            }else{
                this.textBlock(gear.effect||'固定属性装备',436,-52,282,78);
                if(entry.slot)this.detailAction('卸下装备',()=>this.manage('unequip',entry.slot),run.editable&&usedSlots(bag)<bag.capacity);
                else{
                    this.detailAction('穿戴装备',()=>this.manage('equip',entry.item.id),run.editable,-195);
                    if(gear.id!=='emergency-weapon')this.button(run.nearTower?'拆解':'回塔后可拆解',436,-253,165,()=>{
                        if(run.nearTower&&run.editable)this.confirmDismantle(entry.item.id,gear.name);
                    },undefined,'#F6E7D1',42);
                }
            }
            return;
        }
        if(entry.kind==='material'){
            const material=run.config.materials.find(definition=>definition.id===entry.id)!;
            this.section(`持有 ${bag.materials[entry.id]||0}`,436,77,282,19);
            this.section('获取来源',436,12,285,18,C.gold);
            this.textBlock(material.source||'通过采集或击败怪物获得。',436,-57,283,113,19);
            if(entry.id==='food')this.detailAction('吃一份 · F',()=>this.manage('food'),run.editable&&!!bag.materials.food&&run.state.hunger<run.config.survival.hungerMax);
            return;
        }
        if(entry.action==='emergency'){
            const owned=[...bag.equipment,...Object.values(bag.worn)].some(item=>item?.definition==='emergency-weapon');
            this.textBlock('在塔旁免费领取，攻击 +2。只能持有一把，不能拆解。',436,-9,285,151,19);
            this.detailAction(owned?'已持有':run.nearTower?'领取':'请靠近营地塔',()=>this.manage('emergency'),run.editable&&run.nearTower&&!owned&&usedSlots(bag)<bag.capacity);
            return;
        }
        const gathering=entry.action,level=run.config.growth.toolLevel,tool=gathering==='logging'?'improved-axe':'improved-pick';
        const owned=bag.tools.includes(tool);
        this.textBlock(`在塔旁升级，需要${gathering==='logging'?'伐木':'采矿'} ${level} 级。`,436,43,280,74,18);
        this.renderCosts(run,run.config.growth.toolCost,-29);
        this.detailAction(owned?'已升级':!run.nearTower?'请靠近营地塔':run.gatheringLevel(gathering)<level?`需要采集 ${level} 级`:'升级工具',()=>this.manage('upgrade-tool',gathering),run.editable&&run.nearTower&&!owned&&run.gatheringLevel(gathering)>=level&&hasMaterials(bag,run.config.growth.toolCost));
    }
    private confirmDismantle(item:string,name:string):void {
        this.mode='guide';this.backdrop('拆解装备',`拆解后「${name}」将消失，返还部分材料。`);
        this.button('取消',-165,-76,245,()=>this.renderBag());
        this.button('确认拆解',165,-76,245,()=>this.manage('dismantle',item),undefined,C.peach);
    }
    private deathSummary(development=false):void {
        const s=this.session;if(!s)return;const r=s.run;
        this.mode='loss';s.pause('menu');this.clearInput();
        this.backdrop('上次死亡结果',`本局第 ${r.state.stats.deaths} 次倒下 · ${r.battle.alive?'已复活':`复活剩余 ${Math.max(0,Math.ceil((r.state.respawnAt??r.state.time)-r.state.time))} 秒`} · 世界已暂停`);
        this.label(`永久消失：${r.state.lost.map(item=>this.itemName(item.definition)).join('、')||'无'}`,0,126,24,C.red);
        this.label('损失装备不会掉在地上，也不返还材料；读档不会重新判定。',0,73,18,C.mist);
        this.label(`当前穿戴：${SLOTS.map(slot=>`${slotNames[slot]} ${r.state.inventory.worn[slot]?this.itemName(r.state.inventory.worn[slot]!.definition):'空'}`).join(' · ')}`,0,6,18,C.white,1190,70);
        this.label(`背包装备 ${r.state.inventory.equipment.length} 件 · ${this.config!.materials.filter(m=>r.state.inventory.materials[m.id]).map(m=>`${m.name} ${r.state.inventory.materials[m.id]}`).join(' / ')}\n角色生命 ${Math.ceil(r.battle.player.health)} · 塔 ${Math.ceil(r.tower.health)}/${r.tower.maxHealth}`,0,-91,18,C.mist,1140,90);
        if(development){
            this.label('开发样本在死亡／复活节点暂停；正式旅程不会自动暂停。',0,-188,16,C.gold);
            this.button('继续样本',-170,-265,260,()=>this.play());
            this.button('保存并返回菜单',170,-265,280,()=>{void this.returnMenu();});
        }else this.button('返回行囊',0,-265,260,()=>this.renderBag());
    }
    private openCharacter(from:'bag'|'play'):void {
        const s=this.session;if(!s||!s.commandsAllowed)return;
        this.characterReturn=from;this.mode='character';s.pause('menu');this.clearInput();
        const run=s.run,battle=run.battle,hero=run.config.characters.find(item=>item.id===run.progression.hero)!;
        this.backdrop('人物状态','世界已暂停');
        this.card('人物画像',-374,-34,378,468,C.paper,21);
        this.illustration('人物画像',this.heroFrames[hero.id][0],-374,47,207);
        this.section(`Lv.${run.level}  ${hero.name}`,-374,-72,324,24);
        this.textBlock(hero.talent,-374,-119,319,69,16);
        this.illustration('攻击',icons.weapon,-492,-195,39);this.section(`攻击 ${battle.config.attackDamage}`,-430,-195,92,17);
        this.illustration('防御',icons.shield,-327,-195,39);this.section(`防御 ${battle.defense}`,-262,-195,92,17);
        this.card('生存与成长',209,-34,746,468,C.paper,21);
        this.section('生存状态',209,161,682,24);
        this.meter('生命',icons.heart,-38,102,200,meterColors.health,'#FBE6DF')(battle.player.health,battle.config.health,`生命 ${Math.ceil(battle.player.health)} / ${battle.config.health}`);
        this.meter('体力',icons.stamina,198,102,200,meterColors.stamina,'#FAF0CF')(battle.stamina,battle.config.stamina,`体力 ${Math.floor(battle.stamina)} / ${battle.config.stamina}`);
        this.meter('饥饿',icons.food,437,102,200,meterColors.food,'#EAF0D7')(run.state.hunger,run.config.survival.hungerMax,`饥饿 ${Math.floor(run.state.hunger)} / ${run.config.survival.hungerMax}`);
        this.card('体温',209,34,676,44,'#E1F0F7',12);this.illustration('体温',icons.temperature,-96,34,33);
        this.section(`体温 ${run.environment.temperature.toFixed(1)}°  ·  安全范围 ${run.config.environment.safeLow}–${run.config.environment.safeHigh}°`,216,34,568,18);
        const xp=experienceAt(run.progression.combatXp,run.config.growth.combatThresholds);
        this.meter('战斗成长',icons.weapon,209,-42,676,meterColors.xp,'#E9EDF5')(xp.remaining,xp.needed??0,`战斗等级 ${xp.level} · ${xp.needed===null?'已满级':`${xp.remaining} / ${xp.needed} XP`}`);
        this.section('采集成长',209,-110,686,23);
        const gathering=[['logging','伐木',icons.wood],['mining','采矿',icons.stone],['foraging','采集',icons.herb]] as const;
        gathering.forEach(([id,name,index],position)=>{
            const state=experienceAt(run.progression.gathering[id],run.config.growth.gatheringThresholds);
            this.meter(name,index,-38+position*237,-177,200,meterColors.food,'#EAF2D9')(state.remaining,state.needed??0,`${name} Lv.${state.level} · ${state.needed===null?'满级':`${state.remaining}/${state.needed}`}`);
        });
        this.button(from==='bag'?'返回行囊 · P':'返回游戏 · P',0,-313,252,()=>this.closeCharacter(),undefined,C.primary,48);
    }
    private closeCharacter():void {
        if(this.characterReturn==='bag')this.renderBag();else this.play();
    }
    private renderTraining():void {
        const s=this.session;if(!s)return;this.mode='training';s.pause('menu');this.clearInput();const r=s.run;
        this.backdrop('营地训练','本局最多学习两种，已选技能不能替换。');
        this.button('返回行囊',532,300,170,()=>this.renderBag(),undefined,C.forest,44);
        this.section(`Lv.${r.level}    已学 ${r.skills.learned.length} / 2    可学 ${Math.max(0,r.trainingSlots-r.skills.learned.length)} 种`,0,181,857,19);
        r.config.skills.forEach((skill,i)=>{
            const x=i%2===0?-288:288,y=i<2?65:-140,tone=skillStyle[skill.id];
            const learned=r.skills.learned.indexOf(skill.id),count=r.skills.learned.length,costs=hasMaterials(r.state.inventory,skill.trainingCost);
            const enabled=learned<0&&count<2&&count<r.trainingSlots&&r.trainingSafe&&costs;
            this.card(skill.name,x,y,548,185,tone.fill,19);
            this.illustration(skill.name,icons[skill.id],x-192,y+10,113);
            this.section(`${skill.name}  /  ${tone.role}`,x+46,y+56,360,24);
            this.section(`${describeSkill(skill)} · 冷却 ${skill.cooldown} 秒`,x+46,y+21,366,17,C.mist);
            const costText=(list:typeof skill.cost)=>list.map(m=>`${r.config.materials.find(def=>def.id===m.id)?.name}×${m.count}`).join('、');
            this.section(`学习：${costText(skill.trainingCost)}${skill.cost.length?` · 施放：${costText(skill.cost)}`:''}`,x+46,y-11,366,15,costs?C.mist:C.red);
            const status=learned>=0?`已学 · 技能 ${learned+1}`:count>=2?'技能槽已满':count>=r.trainingSlots?`Lv.${r.config.growth.skillLevels[count]} 解锁名额`:!r.nearTower?'请靠近营地塔':!r.trainingSafe?'当前无法训练':!costs?'学习材料不足':'学习技能';
            this.button(status,x+45,y-57,301,()=>{
                if(!enabled)return;
                s.command(()=>r.manage(`ui-${++this.sequence}`,'learn',skill.id),true);this.renderTraining();
            },undefined,enabled?C.primary:'#EDE9DB',43);
        });
        this.section(r.message||'点右下角技能图标或按 1 / 2 施放。',0,-301,1005,17,C.mist);
    }
    private result():void {
        const s=this.session!;this.mode='end';s.pause('system');this.clearInput();const r=s.run;
        this.backdrop('营地塔已被摧毁','这段旅程已经结束。');
        this.label(`生存至第 ${r.calendar.day} 天　·　击败 ${r.state.stats.kills} 只怪物\n采集 ${r.state.stats.gathered} 份材料　·　建造 ${r.state.stats.built} 次　·　倒下 ${r.state.stats.deaths} 次`,0,60,25,C.white,1000,150);
        this.button('新的旅程',0,-110,280,()=>this.newGame());
        this.button('返回菜单',0,-185,280,()=>{void this.returnMenu();});
    }
    private storageError():void{
        if(!this.session)return;this.mode='save-error';this.clearInput();this.backdrop('进度暂时无法保存','世界已暂停。重试会提交同一结果。');
        this.label(this.session.error||'请重试。',0,50,19,C.red,1080,120);
        this.button('重试保存',0,-85,260,()=>{void this.retrySave();});
    }
    private async retrySave():Promise<void>{const s=this.session;if(!s)return;if(await s.save()){if(s.run.state.ended)this.result();else this.play();}else this.storageError();}
    private clearInput():void{this.keys.clear();this.joystick={x:0,y:0};this.moveTouch=null;this.placementTouch=null;this.placementCell=null;this.heldAttack.clear();this.heldBlock.clear();this.session?.run.battle.move({x:0,y:0});this.session?.run.battle.block(false);}
    private pressAttack(source:string|number):void{if(this.session&&!this.session.fixed.paused&&this.heldAttack.press(source)){this.session.run.battle.move(this.movement());this.attack();}}
    private pressBlock(source:string|number):void{const s=this.session;if(s&&!s.fixed.paused&&this.heldBlock.press(source))s.command(()=>s.run.battle.block(true));}
    private releaseBlock(source:string|number):void{if(this.heldBlock.release(source))this.session?.run.battle.block(false);}
    private keyDown(e:EventKeyboard):void{
        const repeated=this.keys.has(e.keyCode);this.keys.add(e.keyCode);if(repeated||this.background)return;
        if(this.mode==='help'){if(e.keyCode===KeyCode.ESCAPE||e.keyCode===KeyCode.KEY_H)this.closeHelp();else if(e.keyCode===KeyCode.ARROW_RIGHT||e.keyCode===KeyCode.ARROW_LEFT){const pages=playGuide(this.config!);this.guidePage=(this.guidePage+(e.keyCode===KeyCode.ARROW_RIGHT?1:pages.length-1))%pages.length;this.renderHelp();}return;}
        if(e.keyCode===KeyCode.KEY_H&&['menu','play','pause'].includes(this.mode)){this.openHelp();return;}
        if(this.mode==='menu'){if(e.keyCode===KeyCode.ENTER){if(this.saved)this.beginRun(this.saved);else this.newGame();}if(e.keyCode===KeyCode.KEY_N)this.newGame();return;}
        if(this.mode==='hero'){if(e.keyCode===KeyCode.DIGIT_1)this.beginRun(undefined,'warden');if(e.keyCode===KeyCode.DIGIT_2)this.beginRun(undefined,'hunter');if(e.keyCode===KeyCode.ESCAPE)this.cancelNewGame();return;}
        if(this.mode==='confirm'){if(e.keyCode===KeyCode.ESCAPE)this.cancelNewGame();return;}
        const s=this.session;if(!s)return;
        if(this.mode==='character'){if(e.keyCode===KeyCode.KEY_P||e.keyCode===KeyCode.ESCAPE)this.closeCharacter();return;}
        if(this.mode==='loss'){if(e.keyCode===KeyCode.KEY_I||e.keyCode===KeyCode.ESCAPE)this.renderBag();return;}
        if(this.mode==='bag'&&e.keyCode===KeyCode.KEY_P){this.openCharacter('bag');return;}
        if(this.mode==='bag'&&e.keyCode===KeyCode.KEY_F){this.manage('food');return;}
        if(this.mode==='training'&&e.keyCode===KeyCode.ESCAPE){this.renderBag();return;}
        if(this.mode==='guide'&&e.keyCode===KeyCode.ESCAPE){this.renderBag();return;}
        if(['bag','training','guide','defense'].includes(this.mode)){if(e.keyCode===KeyCode.KEY_I||e.keyCode===KeyCode.ESCAPE)this.play();return;}
        if(this.mode==='pause'){if(e.keyCode===KeyCode.ESCAPE)this.play();return;}
        if(this.mode!=='play'||s.fixed.paused)return;
        if(e.keyCode===KeyCode.KEY_I)this.openBag();
        if(e.keyCode===KeyCode.KEY_P)this.openCharacter('play');
        if(e.keyCode===KeyCode.ESCAPE){if(this.placement)this.place(this.placement);else this.pauseMenu();}
        if(e.keyCode===KeyCode.KEY_E)s.command(()=>s.run.interact());
        if(e.keyCode===KeyCode.KEY_B)this.place('wall');
        if(e.keyCode===KeyCode.KEY_T)this.place('tower');
        if(e.keyCode===KeyCode.KEY_R)s.command(()=>s.run.repair());
        if(e.keyCode===KeyCode.KEY_X)s.command(()=>s.run.demolish());
        if(e.keyCode===KeyCode.KEY_F)s.command(()=>s.run.manage(`ui-${++this.sequence}`,'food'),true);
        if(e.keyCode===KeyCode.KEY_J||e.keyCode===KeyCode.SPACE)this.pressAttack(`key-${e.keyCode}`);
        if(e.keyCode===KeyCode.KEY_K)this.blink();
        if(e.keyCode===KeyCode.KEY_L)this.pressBlock(`key-${e.keyCode}`);
        if(e.keyCode===KeyCode.DIGIT_1)this.cast(0);
        if(e.keyCode===KeyCode.DIGIT_2)this.cast(1);
    }
    private keyUp(e:EventKeyboard):void{this.keys.delete(e.keyCode);this.heldAttack.release(`key-${e.keyCode}`);if(e.keyCode===KeyCode.KEY_L)this.releaseBlock(`key-${e.keyCode}`);}
    private movement():Vec {
        const held=(primary:number,alternate:number)=>Number(this.keys.has(primary)||this.keys.has(alternate));
        const x=held(KeyCode.KEY_D,KeyCode.ARROW_RIGHT)-held(KeyCode.KEY_A,KeyCode.ARROW_LEFT),y=held(KeyCode.KEY_W,KeyCode.ARROW_UP)-held(KeyCode.KEY_S,KeyCode.ARROW_DOWN);
        return x||y?{x,y}:this.joystick;
    }
    private attack():void{
        const s=this.session;if(!s||s.fixed.paused)return;const b=s.run.battle;
        const move=this.movement();if(!move.x&&!move.y){
            const e=b.enemies.filter(e=>e.health>0&&distance(e.position,b.player.position)<125).sort((a,c)=>distance(a.position,b.player.position)-distance(c.position,b.player.position))[0];
            if(e)b.player.facing=direction({x:e.position.x-b.player.position.x,y:e.position.y-b.player.position.y});
        }if(b.attack())this.sound('attack');
    }
    private blink():void {
        const s=this.session;if(!s||s.fixed.paused)return;
        if(!s.command(()=>s.run.battle.blink()))s.run.message=s.run.battle.blinkCooldown>0?'闪现冷却中。':'前方有阻挡，或当前动作不能闪现。';
    }
    private cast(slot:number):void {
        const s=this.session;if(!s||s.fixed.paused)return;
        const run=s.run,status=run.castStatus(slot);
        if(status.kind==='empty'){
            const level=run.config.growth.skillLevels[slot];
            run.message=run.level<level?`达到 Lv.${level} 后可在营地训练学习技能。`:'打开行囊，进入营地训练学习技能。';return;
        }
        const {skill}=status;
        if(!s.command(()=>run.cast(slot)))return;
        this.castEffect={id:skill.id,position:{...run.battle.player.position},facing:{...run.battle.player.facing},started:run.state.time,range:skill.range};
        this.sound(skill.heal?'gather':'attack');
    }
    private drawCastEffect(run:SurvivalRun):void {
        const effect=this.castEffect;if(!effect)return;
        if(!run.battle.alive){this.castEffect=null;return;}
        const progress=(run.state.time-effect.started)/.5;
        if(progress>=1){this.castEffect=null;return;}
        const g=this.effects,p=run.battle.player.position,x=effect.position.x-p.x,y=effect.position.y-p.y;
        const tint=color(skillStyle[effect.id].light);tint.a=Math.round(255*(1-progress));
        const angle=Math.atan2(effect.facing.y,effect.facing.x);
        g.strokeColor=tint;g.fillColor=tint;g.lineWidth=5;
        switch(effect.id){
            case 'sweep':
                g.lineWidth=13*(1-progress)+3;g.arc(x,y,effect.range*(.66+.34*progress),angle-1.5,angle+1.5,false);g.stroke();break;
            case 'shockwave':
                for(let ripple=0;ripple<3;ripple++){
                    const travel=Math.max(0,progress-ripple*.12)*effect.range;
                    if(travel<=0)continue;
                    g.circle(x+effect.facing.x*travel,y+effect.facing.y*travel,23+ripple*8);g.stroke();
                }
                break;
            case 'warcry':
                g.circle(x,y,40+effect.range*.8*progress);g.stroke();
                if(progress>.18){g.circle(x,y,30+effect.range*.8*(progress-.18));g.stroke();}
                break;
            case 'first-aid':
                g.circle(x,y,24+34*progress);g.stroke();
                g.roundRect(x-17,y+81+19*progress,34,10,3);g.roundRect(x-5,y+69+19*progress,10,34,3);g.fill();break;
        }
    }
    private updateFieldStatus(run:SurvivalRun,directionText:string):void {
        const b=run.battle,calendar=run.calendar,time=Math.ceil(calendar.remaining),meters=this.hudMeters,c=run.config;
        const xp=experienceAt(run.progression.combatXp,c.growth.combatThresholds);
        this.hudIdentity.string=`Lv.${xp.level}  ${c.characters.find(hero=>hero.id===run.progression.hero)!.name}`;
        meters.xp(xp.remaining,xp.needed??0,xp.needed===null?'已满级':`经验 ${xp.remaining}/${xp.needed}`);
        meters.health(b.player.health,b.config.health,`生命 ${Math.ceil(b.player.health)}/${b.config.health}`);
        meters.stamina(b.stamina,b.config.stamina,`体力 ${Math.floor(b.stamina)}`);
        meters.food(run.state.hunger,c.survival.hungerMax,`饥饿 ${Math.floor(run.state.hunger)}`);
        meters.tower(run.tower.health,run.tower.maxHealth,`塔 ${Math.ceil(run.tower.health)}/${run.tower.maxHealth}`);
        const value=run.environment.temperature,condition=value<c.environment.safeLow?'偏冷':value>c.environment.safeHigh?'偏热':'适宜';
        this.hudTemperature.string=`${value.toFixed(0)}° · ${condition}`;
        this.hudTemperature.color=color(condition==='适宜'?C.blue:C.red);
        const phase={day:'白天',dusk:'黄昏',night:'黑夜'}[calendar.phase];
        this.hudClock.string=`第 ${calendar.year} 年 · ${c.environment.seasons[calendar.season].name} · 第 ${calendar.day} 天    ${phase} ${Math.floor(time/60)}:${String(time%60).padStart(2,'0')} ×${this.speed}`;
        this.hudTowerRange.string=`${directionText} ${Math.round(distance(run.towerPosition,b.player.position)/run.world.grid.cellSize)} 格${run.tower.health<run.tower.maxHealth*.3?' · 危险':''}`;
        const usable=b.alive&&!b.blocking&&!b.attacking&&b.time>=b.castUntil;
        this.actionTiles[0](b.attacking?'攻击中':usable?'可攻击':'暂不可用',0,usable||b.attacking);
        this.actionTiles[1](b.blinkCooldown>0?`${b.blinkCooldown.toFixed(1)} 秒`:usable?'就绪':'暂不可用',b.blinkCooldown/b.config.blinkCooldown,usable&&b.blinkCooldown<=0);
        this.actionTiles[2](b.blocking?'格挡中':b.stamina<b.config.blockHitCost?'体力不足':usable?'按住格挡':'暂不可用',0,b.blocking||usable&&b.stamina>=b.config.blockHitCost);
        for(let slot=0;slot<2;slot++){
            const status=run.castStatus(slot),tile=this.actionTiles[slot+3];
            if(status.kind==='empty')tile(run.level<c.growth.skillLevels[slot]?`Lv.${c.growth.skillLevels[slot]} 解锁`:'可在塔旁学习',0,false);
            else if(status.kind==='cooldown')tile(`${status.remaining.toFixed(1)} 秒`,status.remaining/status.skill.cooldown,false);
            else tile({blocked:'暂不可用',full:'生命已满',materials:'材料不足',ready:'就绪'}[status.kind],0,status.kind==='ready');
        }
    }
    private sound(name:string):void {if(this.soundEnabled&&!this.background&&this.sounds[name])this.audio.playOneShot(this.sounds[name],.35);}
    update(delta:number):void{
        this.fitSafeArea();
        const s=this.session;if(!s)return;
        if(s.error&&this.mode!=='save-error'){this.storageError();return;}
        if(this.mode!=='play'){if(this.performanceProbe){this.performanceInterrupted=true;this.performanceLastFrame=0;}return;}
        const workStarted=this.performanceProbe?performance.now():0;
        const observedDelta=this.performanceLastFrame?(workStarted-this.performanceLastFrame)/1000:0;
        this.performanceLastFrame=workStarted;
        // 每次仍使用 30Hz 固定步；×4 只增加同一帧内的步数。
        for(let i=0;i<this.speed;i++)s.frame(delta,()=>{
            s.run.battle.move(this.movement());if(this.heldAttack.held)this.attack();
        });
        const r=s.run;
        if(r.state.stats.deaths>this.lastAudio.deaths)this.sound('death');else if(r.battle.player.health<this.lastAudio.health)this.sound('hit');
        if(r.state.stats.gathered>this.lastAudio.gathered)this.sound('gather');if(r.calendar.phase==='night'&&this.lastAudio.phase!=='night')this.sound('night');
        this.lastAudio={health:r.battle.player.health,gathered:r.state.stats.gathered,deaths:r.state.stats.deaths,phase:r.calendar.phase};
        if(s.run.state.ended&&!s.saving&&!s.error){this.result();return;}
        if(this.outcomeProbe==='death'&&r.state.stats.deaths>0){this.outcomeProbe='respawn';this.deathSummary(true);return;}
        if(this.outcomeProbe==='respawn'&&r.battle.alive){this.outcomeProbe=null;this.deathSummary(true);return;}
        this.draw();
        if(this.seasonProbe){this.hint.string=`本地常速样本 ${this.seasonProbe.index+1}/${SEASON_SAMPLES.length}：${SEASON_SAMPLES[this.seasonProbe.index].name} · ${(r.state.time-this.seasonProbe.time).toFixed(1)}/30s · 15s 自动存取 · 临时进度`;void this.stepSeasonProbe();}
        if(this.performanceProbe&&observedDelta>0)this.observePerformance(observedDelta,performance.now()-workStarted);
    }
    private drawTerrain(r:SurvivalRun,p:Vec):void {
        const {season,phase}=r.calendar,phaseKey=`${season}:${phase}`,discovered=r.world.state.explored.length;
        if(this.terrainPlayer?.x===p.x&&this.terrainPlayer.y===p.y&&this.terrainPhase===phaseKey&&this.terrainDiscovered===discovered)return;
        this.terrainPlayer={...p};this.terrainPhase=phaseKey;this.terrainDiscovered=discovered;
        const g=this.terrain,grid=r.world.grid,size=grid.cellSize,{x:left,y:bottom}=grid.bounds;
        const ground=color((phase==='night'?nightGround:phase==='dusk'?duskGround:this.seasonColors)[season]);
        const dark=color('#22394C'),light=color('#FFFBE5');
        g.clear();g.fillColor=Color.lerp(new Color(),ground,dark,.34);g.rect(-640,-360,1280,720);g.fill();
        const startX=Math.max(0,Math.floor((p.x-640-left)/size)),endX=Math.min(grid.columns-1,Math.floor((p.x+640-left)/size));
        const startY=Math.max(0,Math.floor((p.y-360-bottom)/size)),endY=Math.min(grid.rows-1,Math.floor((p.y+360-bottom)/size));
        const tiles:Vec[][]=[[],[],[],[]];
        for(let y=startY;y<=endY;y++)for(let x=startX;x<=endX;x++)tiles[(r.world.isExplored({x,y})?0:2)+((x+y)&1)].push({x:left+x*size-p.x,y:bottom+y*size-p.y});
        const colors=[ground,Color.lerp(new Color(),ground,light,.12),Color.lerp(new Color(),ground,dark,.22),Color.lerp(new Color(),ground,dark,.16)];
        tiles.forEach((group,index)=>{
            if(!group.length)return;g.fillColor=colors[index];
            for(const tile of group)g.rect(tile.x+.8,tile.y+.8,size-1.6,size-1.6);
            g.fill();
        });
    }
    private draw():void {
        const s=this.session!,r=s.run,b=r.battle,g=this.world,fx=this.effects,p=b.player.position,size=r.world.grid.cellSize;
        this.drawTerrain(r,p);g.clear();fx.clear();this.spriteSeen.clear();this.actorOrder=0;const night=r.calendar.phase==='night';
        const defenses=defenseLayout(r.state.buildings);
        for(const [id,entry] of this.defenseNodes){entry.node.active=false;if(!defenses.has(id)){entry.node.destroy();this.defenseNodes.delete(id);}}
        const at=(v:Vec)=>({x:v.x-p.x,y:v.y-p.y});
        const actors:{y:number;paint:()=>void}[]=[];
        for(const n of r.world.resourcesIn(r.world.activeChunks(p,p))){
            const v=at(r.world.center(n.cell));if(n.amount<=0||Math.abs(v.x)>700||Math.abs(v.y)>430||!r.world.isExplored(n.cell))continue;
            actors.push({y:v.y,paint:()=>{
                const item=r.world.definition(n).item,index=item==='wood'?8:item==='stone'?9:item==='food'?10:11;
                if(this.drawSprite(n.id,index,v,item==='wood'?108:65,item==='wood'?108:65,night?'#D0E7F7':'#FFFFFF'))return;
                if(r.world.definition(n).item==='wood'){
                    g.fillColor=color('#78684A');g.roundRect(v.x-9,v.y-8,18,42,4);g.fill();g.fillColor=color(night?'#234436':C.pine);g.circle(v.x,v.y+30,29);g.fill();g.strokeColor=color('#638063');g.lineWidth=1;g.stroke();
                }else if(r.world.definition(n).item==='stone'){g.fillColor=color('#899186');g.roundRect(v.x-20,v.y-12,40,30,9);g.fill();}
                else {g.fillColor=color(n.definition==='food'?'#AA765D':C.blue);g.circle(v.x,v.y+5,13);g.fill();g.fillColor=color(C.leaf);g.ellipse(v.x-8,v.y+15,7,13);g.fill();}
            }});
        }
        for(const build of r.state.buildings){const v=at(r.world.center(build.cell));if(Math.abs(v.x)>700||Math.abs(v.y)>450)continue;
            actors.push({y:v.y,paint:()=>{
                const shape=defenses.get(build.id);
                if(shape){
                    this.drawWall(build,shape,v,size,night);
                    if(build.health<build.maxHealth)this.healthBar(fx,v.x-19,v.y+30,38,build.health/build.maxHealth,'#78C2EA');
                    return;
                }
                const frame=this.buildingFrames[build.kind];
                const tint=night?'#DEF0FF':'#FFFFFF',towerSize=111,wallSize=67;
                if(this.drawSprite(build.id,frame,v,build.kind==='tower'?towerSize:wallSize,build.kind==='tower'?towerSize:build.open?22:wallSize,tint)){
                    if(build.kind==='tower'||build.health<build.maxHealth)this.healthBar(fx,v.x-26,v.y+(build.kind==='tower'?towerSize:build.open?24:wallSize),52,build.health/build.maxHealth,build.kind==='tower'?C.sun:'#78C2EA');return;
                }
                const tower=build.kind==='tower';g.fillColor=color(tower?C.gold:build.kind==='campfire'?'#D98F58':build.kind==='cooler'?C.blue:build.kind==='stone-wall'?'#8A9291':build.kind==='reinforced-wall'?'#AC9C79':build.open?C.leaf:'#7D7256');
                g.roundRect(v.x-21,v.y-20,42,tower?80:build.open?12:44,5);g.fill();g.strokeColor=color(tower?C.white:C.mist);g.lineWidth=2;g.stroke();
                if(tower){g.fillColor=color('#F2D699');g.circle(v.x,v.y+67,10);g.fill();g.strokeColor=color('#8A8055');g.lineWidth=1;g.circle(v.x,v.y,85);g.stroke();}
                if(build.fuelUntil&&build.fuelUntil>r.state.time){g.strokeColor=color(C.gold);g.circle(v.x,v.y,32);g.stroke();}
                this.healthBar(g,v.x-23,v.y+(tower?87:32),46,build.health/build.maxHealth,tower?C.gold:C.blue);
            }});
        }
        for(const drop of r.state.drops){const v=at(drop.position);g.fillColor=color(C.sun);g.circle(v.x,v.y,5);g.fill();}
        actors.push({y:0,paint:()=>this.actor(g,{x:0,y:0},b.player.facing,b.alive?C.gold:'#736956',true)});
        for(const e of b.enemies)if(e.health>0&&distance(e.position,p)<820){const cell=r.world.grid.cellAt(e.position);if(!cell||!r.world.isExplored(cell))continue;const v=at(e.position);if(Math.abs(v.x)>665||v.y>224||v.y< -438)continue;actors.push({y:v.y,paint:()=>this.enemy(g,fx,e,v)});}
        actors.sort((a,c)=>c.y-a.y).forEach(a=>a.paint());
        for(const [id,node] of this.sprites)if(!this.spriteSeen.has(id)){node.active=false;this.sprites.delete(id);this.spritePool.push(node);}
        if(b.blocking||b.attacking){const angle=Math.atan2(b.player.facing.y,b.player.facing.x);fx.strokeColor=color(b.blocking?'#83E5FF':'#FFF2B8');fx.lineWidth=5;fx.arc(0,12,b.blocking?35:75,angle-.7,angle+.7,true);fx.stroke();}
        if(this.placement)this.drawPlacement(r,p,size);
        if(r.channel){
            const node=r.channel.kind==='gather'?r.world.state.resources.find(n=>n.id===r.channel!.target):null;
            const resource=node?r.world.definition(node):null;
            const duration=resource?r.gatheringSeconds(resource.item,resource.seconds):r.channel.kind==='repair'?r.config.survival.repairSeconds:r.config.survival.relocationSeconds;
            const progress=1-(r.channel.until-r.state.time)/duration;this.healthBar(fx,-50,-34,100,Math.max(0,progress),C.sun);
        }
        this.drawCastEffect(r);
        const directionText=Math.abs(r.towerPosition.x-p.x)>Math.abs(r.towerPosition.y-p.y)?r.towerPosition.x>p.x?'→':'←':r.towerPosition.y>p.y?'↑':'↓';
        this.updateFieldStatus(r,directionText);
        if(r.state.respawnAt!==null){const lost=r.state.lost.map(e=>this.itemName(e.definition)).join('、')||'无';this.message.string=`倒下了 · ${Math.max(0,Math.ceil(r.state.respawnAt-r.state.time))} 秒后在塔旁复活 · 永久损失：${lost}`;}
        else this.message.string=s.saving?'正在保存进度…':r.message;
        if(r.tower.health<r.tower.maxHealth*.3)this.message.string='营地塔生命危险！塔毁即本局结束，角色复活不会恢复塔生命。';
        this.message.color=color(r.tower.health<r.tower.maxHealth*.3||r.state.respawnAt!==null?C.red:C.gold);
        const tutorial=r.state.stats.gathered<4?'靠近树木，按采集 E':!r.state.inventory.worn.weapon?'塔旁打开背包 → 制造木剑 → 穿戴':r.state.stats.built===0?'用木材建墙 B，留门供自己进出':r.calendar.day===1?'守住第一夜；白天可迁塔':'提前准备篝火和降温棚';
        const action=this.placement?'绿格可建 · 按住预览，松手放置 · 相邻墙自动连':r.channel?'正在操作…':r.progression.counterUntil>r.state.time?'强化反击就绪':r.progression.blinkUntil>r.state.time?'猎手攻击增益中':tutorial;
        this.hint.string=`木 ${r.state.inventory.materials.wood||0}　·　石 ${r.state.inventory.materials.stone||0}　·　食物 ${r.state.inventory.materials.food||0}\n${action}`;
    }
    private healthBar(g:Graphics,x:number,y:number,width:number,fraction:number,tint:string):void{g.fillColor=color(C.white);g.roundRect(x-1,y-1,width+2,7,3);g.fill();if(fraction>0){g.fillColor=color(tint);g.roundRect(x,y,width*Math.min(1,fraction),5,2);g.fill();}}
    private actor(g:Graphics,p:Vec,facing:Vec,tint:string,player:boolean):void{
        if(player){const index=Math.abs(facing.x)>Math.abs(facing.y)?facing.x<0?1:2:facing.y>0?3:0;const frame=this.heroFrames[this.session!.run.progression.hero][index];if(this.drawSprite('player',frame,p,82,82,this.session!.run.battle.alive?'#FFFFFF':'#A1B2BE'))return;}
        g.fillColor=color('#16231C');g.ellipse(p.x,p.y-3,20,8);g.fill();g.fillColor=color(tint);g.roundRect(p.x-15,p.y,30,32,10);g.fill();g.fillColor=color(player?'#E6D8B8':'#ACB099');g.circle(p.x,p.y+31,12);g.fill();
        const axis=Math.abs(facing.x)>Math.abs(facing.y)?{x:Math.sign(facing.x),y:0}:{x:0,y:Math.sign(facing.y)};
        g.strokeColor=color(player?C.white:'#D19A76');g.lineWidth=4;g.moveTo(p.x+axis.x*10,p.y+18+axis.y*10);g.lineTo(p.x+axis.x*33,p.y+18+axis.y*33);g.stroke();
    }
    private enemy(g:Graphics,fx:Graphics,e:Enemy,p:Vec):void{
        if(e.phase==='windup'){
            const x=p.x+e.attackFacing.x*20,y=p.y+e.attackFacing.y*20,fill=color('#FF6555');fill.a=92;
            g.fillColor=fill;g.circle(x,y,e.definition.range);g.fill();
            g.strokeColor=color('#FF8D69');g.lineWidth=3;g.circle(x,y,e.definition.range);g.stroke();
        }
        const scale=e.definition.elite?1.4:e.definition.role==='fast'?.8:1;
        if(this.drawSprite(e.id,this.monsterFrames[e.definition.id],p,76*scale,76*scale,'#FFFFFF')){
            if(e.phase==='windup'||e.health<e.definition.health)this.healthBar(fx,p.x-19,p.y+76*scale,38,e.health/e.definition.health,'#FF8594');return;
        }
        this.actor(g,p,e.facing,C.red,false);this.healthBar(g,p.x-20,p.y+52,40,e.health/e.definition.health,C.red);
    }
    private drawWall(build:RunState['buildings'][number],shape:DefenseShape,p:Vec,size:number,night:boolean):void {
        let entry=this.defenseNodes.get(build.id);
        if(!entry){const node=this.ui('连接围墙',this.world.node,0,0,size,size);node.addComponent(Graphics);entry={node,signature:''};this.defenseNodes.set(build.id,entry);}
        const signature=`${build.kind}:${shape.mask}:${shape.axis}:${build.open}:${size}:${night}`;
        if(entry.signature!==signature){drawDefense(entry.node.getComponent(Graphics)!,build,shape,size,night);entry.signature=signature;}
        entry.node.active=true;entry.node.setPosition(p.x,p.y);entry.node.setSiblingIndex(this.actorOrder++);
    }
    private drawPlacement(r:SurvivalRun,p:Vec,size:number):void {
        const g=this.effects,grid=r.world.grid,center=grid.cellAt(p),kind=this.placement;if(!center||!kind)return;
        const reach=Math.ceil(r.config.survival.buildRange/size),def=r.config.survival.buildings.find(b=>b.id===kind)!;
        const affordable=hasMaterials(r.state.inventory,def.costs),selected=this.placementCell;
        for(let y=center.y-reach;y<=center.y+reach;y++)for(let x=center.x-reach;x<=center.x+reach;x++){
            if(x<0||y<0||x>=grid.columns||y>=grid.rows)continue;
            const cell={x,y},v=r.world.center(cell);if(distance(v,p)>r.config.survival.buildRange||!r.world.isExplored(cell))continue;
            const valid=r.canPlace(cell,kind==='tower'),target=selected?.x===x&&selected.y===y;
            const tint=color(valid?(affordable?'#52B96B':'#D89A35'):'#C66A68');tint.a=target?145:valid?65:24;
            g.fillColor=tint;g.roundRect(v.x-p.x-size/2+2,v.y-p.y-size/2+2,size-4,size-4,4);g.fill();
            g.strokeColor=color(target?'#FFFCEF':valid?'#439459':'#B7766B');g.lineWidth=target?3:1;
            g.roundRect(v.x-p.x-size/2+2,v.y-p.y-size/2+2,size-4,size-4,4);g.stroke();
        }
    }
    private drawSprite(id:string,index:number,p:Vec,width:number,height:number,tint:string):boolean {
        const frame=this.frames[index];if(!frame)return false;
        let n=this.sprites.get(id);
        if(!n){n=this.spritePool.pop()||this.ui('WorldSprite',this.world.node,0,0,width,height);if(!n.getComponent(Sprite)){n.getComponent(UITransform)!.setAnchorPoint(.5,0);n.addComponent(Sprite).sizeMode=Sprite.SizeMode.CUSTOM;}this.sprites.set(id,n);}
        n.active=true;n.setPosition(p.x,p.y-4);n.getComponent(UITransform)!.setContentSize(width,height);n.setSiblingIndex(this.actorOrder++);
        const sprite=n.getComponent(Sprite)!;sprite.spriteFrame=frame;sprite.color=color(tint);this.spriteSeen.add(id);return true;
    }
}
