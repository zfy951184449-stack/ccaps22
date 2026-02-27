import sys
import hashlib

raw_text = """AC Cycle2+Cycle3
VIN Cycle2 +PT1810-PT1812+T1810/U1850-T1810 RIN
VIN Cycles +PT1810-PT1812
CEX AKTA 2" CIP+sample（立检；14点前送样）+排空
BH1733-U1871接1M NaOH
CEX 物料检查和准备、检查设备状态&一次性溶液检查无渗漏&推到房间
纯化2 UFDF1 物料检查和准备、检查设备状态&一次性溶液检查无渗漏&推到房间
T1810/U1850-T1810 RIN
AC Cycle 4
AC Post-treatment
VIN Cycle4+PT1810-PT1812
T1812TT OT pass后拆除LF更换喷淋球）
拆除上样罐所有器具,工艺结束AKTA 排空台秤不要断电
BH1731/1720-U1850 BlockA (1790) RIP &SIP
BHT1732/1740-U1850 BlockB （1790） RIP &SIP
BH1741/1725-U1850 BlockB (1791) CIPE 14&SIP
AC procedure 完成立即处理DSPBH1720/BH1741管线，然后通知OPS处理罐子
AC消毒/保存液/中和排废，tank推至2432（留一个给CEX用）
填写AC工艺物料交接单，退库物料放置2450对应区域（如有）灭活溶液勿排，下批仍使用
审核AC BPR，更新邮件4天修改完成
PT1810-PT1812 CIP
U1850-PT1810 CIP
PT1810 Bypass CIP
UFDF1工艺前检查+UFDF system RIP+取电导&安装膜包/膜包垫片用新的+膜包
minneare处理（回流透过安装取样阀）
AC AKTA 2‘’ CIP-Storage
BH1733-U1871接1MT成 SUB 0.1 M NaOH WX-MBR-015932-035/-036
尽快T1814 IT （IT pass后拆除LF更换喷淋球）完成后通知UFDF1起工艺程序
拆除上样罐所有器具
工艺结束AKTA排空
UFDF1 管路连接（回流更换取样基座，透过更换取样阀）
minncare 排废
CEX1814 I结束释放后，执行LFDF1 PR
更新Dfinncae 方案记录
UFDF1 Rinsel&IT &Pre-sani&Rinse2&NWP&EQ&UF不要停
AEX AKTA 15"CIP+sample（立检；14点前送样）+排空
BH1733-U18711M NaOH
纯化2 AEX物料检查和准备、检查设备状态&一次性溶液检查无渗漏&推到房间
接UF&DF&BRC&Dulition&Rinse3&Post-Sani&Rinse4&NWP&IT&Storage
PT1813 LF IT Pass 拆除LF更换喷淋球
拆除上样罐所有器具
1890CIP&SIP 加碱至至少55kg
1891CIP&SIP 加碱至至少55kg
Room 1219&1218 Post PPQ6放行
BOM 物料传递
Room 1219&1218 Post PPQ6 BOM 物料传递
BH1726-U1851 BlockA (1791)RIP &SIP
BH1722/1730-U1851 BlockB (1790)RIP &SIP
BH1721/1720-U1853 (1790) RIP &SIP
BH1724-U1853 （1791） RIP &SIP
PT1812 Bypass CIP
PT1812-U1851 CIP
审核CEX MBR，更新邮件4天修改完成
填写CEX工艺物料交接单，退库物料放置2450对应区域
CEX淋洗、保存溶液、WFI排废，tank推至2452（留一个给AEX用）
U1851-T1814 CIP
PI1814 bypass CIP
T1814-U1853 CIP
填写UFDFI工艺物料交接单，退库物料放置2450对应区域审核UFDF1 MBR，更新邮件4天修改完成
AEX前准备
AKTA system Flush+取电导
AEX Prime
AEX cycle1
AEX Cycle 2
纯化2 HA 物料检查和准备、检查设备状态&一次性溶液检查无渗漏&推到房间
溶液检查（参见bufter plan sheet）
AEX Cycle 2
AEX Pool Adjustment
PT1815 LF IT pass后拆除LF更换喷淋球
工艺结束AKTA 排空
BH1723/BH1730-U1852 BlockB （1790） RIP&SIP
BH1741-U1852 BlockA（1791） RIP&SIP（SIP前安装ST阀）
CEX AKTA 2" CIP+Storage
BH1733-U1871接1M碱
UFDF1 Bypass CIP+Storage
此次需要膜包保存液置换（运行Operation:16 Storage）
BH1733-1871手动接1M NaOH,1720-1853接0.1 M NaOH
U1853-T1813 CIP 
T1813 Bypass CIP
PT1813-U1852 CIP &SIP
AEX AKTA 1.5'CIP+WFI Storage
BH1733-U1871接1M碱
填写AEX工艺物料交接单，退库物料放置2450对应区域
审核AEXBPR，更新邮件4天修改完成
BH1726-U1852 BlockA 执行flush管线50L后，无菌操作接B18溶液500 L至500L出口耐压管袋子（Cytiva 灰色大tank）用于VF
HA Prime
HA Process to EQ
VF 空气滤壳底座和阀门手工器具清洗+zample（BH1733-U1871接IM NaOH，空气滤器底座阀门空气滤芯安装，记录HM/CIP form
压力表使用前检查（联系wangxiaowei 执行校验）
UFDE2 CIP+sample (2t) +storage
1M NaOH：BH1733-1960 手动接碱
0.1M NaOH：SUB
流量计校准
UFDF3 CIP+sample (El) +storage
IM NaOH: BH1733-1960 open 程序，手动接碱
0.1M NaOH: SUB
流量计不要断电
压力表使用前检查（联系wangxiaowei 执行校验）
压力表使用前检查（联系wangxiaowei 执行校验）
1527 WBP2486项目MFG 样品蛋白浓度测定（SoloVPE法）的检验记录传出车间，放置办公室114文件柜
1527更换锐器盒
BOM 物料传递
1527 Post PPQ7&: Unpacking Material Transfer in 1527
病毒前 Post PPQ7& Unpacking需要灭菌BOM物料传递至2450并通联系Liyuxin
U1852-T1815 CIP
HA Process
提醒OPS 1726/1741 当天不排废，第二天排层析柱上层水层高度，并登记在交接班上
VE （U1871） +CIP（Fomular: Magnus- Magnus）+sample（立检，14:00之前）+Drain
BH1733-1871手动接碱~200L
纯化二/纯化三VF物料检查和准备、检查设备&不锈钢系统状态&灭菌物料&通用物料检查（参照VF BOM大菌物料&通用物料清单）；
UFDF2物料检查和准备、检查设备&灭菌物料&通用物料检查（参照UFDF2 BOM/灭菌物料&通用物料清单）：准备两个空tank
UFDF23 溶液推到车间
蠕动泵校准用于UFDF2
UFDF3物料检查和准备、检查准备灭菌物料&通用物料检查（參照UFDF3 BOM/灭菌物料&通用物料清单）；准备一个空tank
BH1726/1741-U1852 BlockA (1791) RIP &SIP 
BH1723/1721/1730-U1852 BlockB (1790)RTP &SIP
PT1810 罐底取样基座安装&罐顶酸碱口ST阀&SIP
U1850-PT1810 SIP
PT1810 WFI Line SIP
PT1812-U1851 SIP
PT1815 Bypass CIP
用过的wash buffer 排废退至2452
填写HA工艺物料交接单，退库物料放置2450对应区域审核EA BPR，更新邮件4天修改完成
EA AKTA 1.5’’ CIP+Storage
BH1733-U1871接1M碱，0.1 M NaOH 2452 推 WX-MR-015932-035，用完排废立即退回2452
填写BPR前面部分内容&管路连接&滤器安装&穿墙滤器安装&收集袋安装
VF Process
填写VF工艺物料交接单，退库物料放置2450对应区域
病毒后物料双层包装传递至病毒后待清洗间，
VF平衡溶液、WFI排废，tank推至2452（留一个白色tank给AC）
UFDF2 RIP取电导
UFDF2填写BPR 前面部分内容&管路连接 &膜包安装（换新膜包/新的垫片和转换
板）
UFDF 15 m2 RIP+UFDF2 Rinse1&IT&sani&Rinse2&&NWP&Hold up volume&EQ&
UFDF2 UF&DF&BRC
1542 WBP2486项目MEFG样品蛋白浓度测定（SoloVPE法）的检验记录传出车间，放置办公室114文件柜
1542 更换锐器盒
1542 Post PPQ7& Unpacking BOM物料传递
BHL783-01871 RIP（1791）&SIP
BH1733-U1960 RIP (1791) &SIP
PT1812 LF滤芯安装&罐底取样基座&取样阀安装&罐底prime口手阀安装&SIP
PT1810-PT1812 SIP
PT1812 WFI Line SIP
UFDF2 Rinse3&Post-Sani&Rinse4&NWP&IT&Storage
填写UFDF2工艺物料交接单，衬袋不退用于UFDF3 CIP，退库物料放置2450对应区域
拆膜包+送至冷库
EQ buffer，UFDF2使用的3个DF buffer，排废推至2452
先把 500L WFI接好，避免与UFDF2超滤袋连接时间冲突
UFDF3填写BPR 前面部分内容&管路连接&膜包安装（新膜包）；
UFDF3 RIP 取电导+UFDF3 Rinse&IT&sani&Rinse2&&NWP &Hold up volume&EQ
WBP2486 Fost PPO7 PI&P2 放行
Room1527 Room 1542 release for WBP2486 Post PPQ7 and Unpacking
1527/1542 WBP2486项目MFG 样品蛋白浓度测定（SoloVPE法）的检验记录传进车间（办公室114文件柜〉
BH1720-U1853 RIP (1790) &SIP
T1814 LF滤芯安装&罐底取样基座安装&SIP
U1851-T1814 SIP
T1814-U1853 SIP
VF (U1871) CIP. (Fomular: Magnus-Magnus) +Storage
BH1733-1871手动接1 M NaOH~200L；HA保存液 工艺剩余0.1 M NaOH ~200L
审核VF BPR，更新邮件4天修改完成
UFDF3 UF &BRC&辅料配制&pH Adustment （HPLC浓度立检）
分装间分装物料检查和准备、检查设备&灭菌物料&通用物料检查（参照分装BOM/灭茵物料＆通用物料清单）
填写MBR物料＆设备检查部分
蠕动泵校准用于Bulk fill
Rinse3&Post-Sani&Rins:4&NWP&IT&Storage
膜包盒盖子手工器具清洗+sample
拆膜包传至冷库
6Kg 天平移出层流罩（通电〉
AC 前准备
纯化一AC&VIN 物料检查和准备、检查设备状态；&一次性溶液检查无渗漏&推到房间（参照纯化一灭菌物料&通用物料清单）
包括sham run（buffer 检查參照 buffer plan sheet）
pall 2000L tank 定位
T1813 LF滤芯更换&罐底取样基座安装&罐底prime口手阀安装&SIP
U1853-T1813 SIP
T1813-U1852 SIP
T1815 &LF滤芯安装&罐底取样基座安装&罐顶安装补料管和调样管路&罐底prime
弯头加手阀安装&SIP
U1852-T1815 SIP
1815 WFI line SIP (ALL)
T1815-U1852 SIP
填写UFDF3工艺物料交接单，退库物料放置2450对应区域衬袋和82管路全保留用于后面CIP
审核UFDF3BPR，更新邮件4天修改完成
分装&转移至冷库过夜
WBP2486 项目MFG 样品蛋白浓度测定（SoloVPE法〉的检验记录传出车间，放置办公室114文件柜
更换锐器盒
BOM物料传递
Room 1219&1218&1220 Post PPQ7 BOM 物料传递通知liyuxin
额外取样容器物料传递
AC 工艺前检查
System flush+取电导
AC Prime
AC Cycle1 至EQ
前处理消毒buffer使用结束后排空后tank退至2452
UFDF3 CIP+storage
1MNaOH:BH1733-1960手动接碱
0.1M NaOH : WEBP2486 UEDF2/3 剩余保存液
工艺落液（包括0.1M NaOH）排废退tank
填写分装工艺物料交接单，退库物料放置2450对应区域
入库
产品入库
产品标签张贴"""

lines = [line.strip() for line in raw_text.split('\n') if line.strip()]

# Defaults
STANDARD_TIME = 12.0
REQUIRED_PEOPLE = 1
OPERATION_TYPE = 'DSP_ALL'
OPERATION_TYPE_ID = 52 # From previous step check

print("INSERT IGNORE INTO operations (operation_code, operation_name, standard_time, required_people, operation_type, operation_type_id, description) VALUES")

values = []
for i, line in enumerate(lines):
    # Generate a unique hash for the code to avoid collisions, but keep it deterministic
    # We'll use a prefix + hash
    hash_object = hashlib.md5(line.encode())
    code_suffix = hash_object.hexdigest()[:8].upper()
    code = f"DSP_{code_suffix}"
    
    # Escape single quotes in the name
    name = line.replace("'", "''")
    
    val = f"('{code}', '{name}', {STANDARD_TIME}, {REQUIRED_PEOPLE}, '{OPERATION_TYPE}', {OPERATION_TYPE_ID}, 'Bulk Import')"
    values.append(val)

print(",\n".join(values) + ";")
