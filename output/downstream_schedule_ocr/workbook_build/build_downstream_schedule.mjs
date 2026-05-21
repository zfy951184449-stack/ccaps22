import fs from "node:fs/promises";
import path from "node:path";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const root = "/Users/zhengfengyi/MFG8APS";
const workDir = path.join(root, "output/downstream_schedule_ocr");
const outputDir = path.join(root, "outputs/downstream_schedule_20260511");
const outputPath = path.join(outputDir, "downstream_schedule_extracted.xlsx");

const dates = [
  ["9/17", "Day0"],
  ["9/18", "Day1 (Harvest)"],
  ["9/19", "Day2"],
  ["9/20", "Day3"],
  ["9/21", "Day4"],
  ["9/22", "Day5"],
  ["9/23", "Day6"],
  ["9/24", "Day7"],
  ["9/25", "Day8"],
  ["9/26", "Day9"],
  ["9/27", "Day10 (Harvest)"],
  ["9/28", "Day11"],
  ["9/29", "Day12"],
];

const dateDay = Object.fromEntries(dates);

const resources = [
  [4, "Room", "房间活动", "", "", "房间活动"],
  [5, "AC", "Vessel", "3000L", "T1810", ""],
  [6, "AC", "Vessel", "15000L", "T1812", ""],
  [7, "AC", "Transfer In", "U1850", "T1550 to U1850", ""],
  [8, "AC", "Transfer Out", "U1850", "U1850 to T1810", ""],
  [9, "AC", "Buffer", "U1850 POUA", "BH1720(WFD)", ""],
  [10, "AC", "Buffer", "U1850 POUA", "BH1731(B04)", ""],
  [11, "AC", "Buffer", "U1850 POUA", "BH1732(B03)", ""],
  [12, "AC", "Buffer", "U1850 POUB", "BH1740(B02)", ""],
  [13, "AC", "Buffer", "U1850 POUB", "BH1741(B02)", ""],
  [14, "AC", "Buffer", "", "B01", ""],
  [15, "AC", "Buffer / Single Use", "", "B23", ""],
  [16, "AC", "Single Use", "", "B06", ""],
  [17, "AC", "Single Use", "", "B07", ""],
  [18, "VIN", "Skid/Process", "2 in AKTA", "1850(14000153)", ""],
  [19, "VIN", "Column", "", "1.2m", ""],
  [20, "VIN", "Transfer Line", "", "T1810 to T1812", ""],
  [22, "Room", "房间活动", "", "", "房间活动"],
  [23, "CEX", "Vessel", "3000L", "T1813", ""],
  [24, "CEX", "Vessel", "4000L", "T1814", ""],
  [25, "CEX", "Vessel", "5250L", "T1815", ""],
  [26, "CEX", "Transfer In", "U1851", "T1812 to U1851", ""],
  [27, "CEX", "Transfer Out", "U1851", "U1851 to T1814", ""],
  [28, "CEX", "Buffer", "U1851 POUA", "BH1726(B10)", ""],
  [29, "CEX", "Buffer", "U1851 POUB", "BH1722(B08)", ""],
  [30, "CEX", "Buffer", "U1851 POUB", "BH1730(B11)", ""],
  [31, "CEX", "Single Use", "", "B09", ""],
  [32, "CEX", "Single Use", "", "B12", ""],
  [33, "CEX", "Skid/Process", "2 in AKTA", "1851(14000154)", ""],
  [34, "CEX", "Column", "", "1.0m", ""],
  [35, "CEX", "Transfer In", "U1853", "T1814 to U1853", ""],
  [36, "CEX", "Transfer Out", "U1853", "U1853 to T1813", ""],
  [37, "UFDF1", "Buffer", "U1853", "BH1720(B15)", ""],
  [38, "UFDF1", "Buffer", "U1853", "BH1721(B14)", ""],
  [39, "UFDF1", "Buffer", "U1853", "BH1724(B13)", ""],
  [40, "UFDF1", "Skid/Process", "30m2 UFDF", "1853(XXX)", ""],
  [41, "AEX", "Transfer In", "U1852", "T1813 to U1852", ""],
  [42, "AEX", "Transfer Out", "U1852", "U1852 to T1815", ""],
  [43, "AEX", "Buffer", "U1852 POUA", "BH1741(B13)", ""],
  [44, "AEX", "Buffer", "U1852 POUB", "BH1723(B16)", ""],
  [45, "AEX", "Buffer", "U1852 POUB", "BH1730(B11)", ""],
  [46, "AEX", "Single Use", "", "B05", ""],
  [47, "AEX", "Skid/Process", "1.5 in AKTA", "1852(14000156)", ""],
  [48, "AEX", "Column", "", "0.8m", ""],
  [49, "HA", "Transfer In", "U1852", "T1815 to U1852", ""],
  [50, "HA", "Buffer", "U1852 POUA", "BH1726(B18)", ""],
  [51, "HA", "Buffer", "U1852 POUA", "BH1741(B13)", ""],
  [52, "HA", "Buffer", "U1852 POUB", "BH1721(B14)", ""],
  [53, "HA", "Buffer", "U1852 POUB", "BH1723(B16)", ""],
  [54, "HA", "Single Use", "", "B17", ""],
  [55, "HA", "Single Use", "", "B15", ""],
  [56, "HA", "Skid/Process", "1.5 in AKTA", "1852(14000156)", ""],
  [57, "HA", "Column", "", "0.8m", ""],
  [58, "VF", "Buffer", "U1871", "BH1726(B18)", ""],
  [59, "VF", "Buffer", "U1871", "BH1733(1M NaOH)", ""],
  [60, "VF", "Skid/Process", "VF Skid", "1871(XXX)", ""],
  [62, "Room", "房间活动", "", "", "房间活动"],
  [63, "UFDF2", "Buffer", "U1960", "BH1733(1M NaOH)", ""],
  [64, "UFDF2", "Single Use", "", "B14", ""],
  [65, "UFDF2", "Single Use", "", "B15", ""],
  [66, "UFDF2", "Single Use", "", "B18", ""],
  [67, "UFDF2", "Skid/Process", "15m2 UFDF", "Manual", ""],
  [69, "Room", "房间活动", "", "", "房间活动"],
  [70, "UFDF3", "Buffer", "Single Use", "B14", ""],
  [71, "UFDF3", "Buffer", "Single Use", "B15", ""],
  [72, "UFDF3", "Buffer", "Single Use", "B19", ""],
  [73, "Bulk Fill", "Pump", "", "4400", ""],
  [74, "Bulk Fill", "Skid/Process", "7m2 UFDF", "Manual", ""],
  [75, "Bulk Fill", "BSC", "", "", ""],
  [78, "CIP Station", "Pre-Viral", "", "CIP1890 / CIP1891", ""],
  [79, "CIP Station", "Post-Viral", "", "CIP1990", ""],
  [80, "CIP Station", "Buffer", "", "CIP1790 / CIP1791", ""],
  [82, "WF1", "WF1 Line", "", "PT1810", ""],
  [83, "WF1", "WF1 Line", "", "PT1811", ""],
  [84, "WF1", "WF1 Line", "", "PT1812", ""],
  [85, "WF1", "WF1 Line", "", "PT1813", ""],
  [86, "WF1", "WF1 Line", "", "PT1814", ""],
  [87, "WF1", "WF1 Line", "", "PT1815", ""],
  [88, "WF1", "WF1 Line", "", "PT1910", ""],
  [90, "Human Resource", "班组", "A", "", ""],
  [91, "Human Resource", "班组", "B", "", ""],
  [92, "Human Resource", "班组", "C", "", ""],
  [93, "Human Resource", "班组", "D", "", ""],
  [94, "Human Resource", "班组", "E", "", ""],
  [95, "Human Resource", "班组", "F", "", ""],
  [96, "Human Resource", "班组", "G", "", ""],
  [97, "Human Resource", "班组", "H", "", ""],
  [98, "Human Resource", "工艺排班组数", "", "", ""],
];

function event(date, module, scope, activity, type, confidence = "中", source = "IMG_1324/IMG_1325 视觉整理", notes = "") {
  return {
    date,
    day: dateDay[date] ?? "",
    module,
    scope,
    activity,
    type,
    confidence,
    source,
    notes,
  };
}

const manualEvents = [
  event("9/17", "AC", "房间活动", "2-1 AC物料准备", "物料/房间", "高", "IMG_1324"),
  event("9/17", "VIN", "2 in AKTA / 1850", "2-1 CIP", "CIP", "高", "IMG_1324"),
  event("9/18", "AC", "房间活动", "3-2 logbook检查", "检查", "高", "IMG_1324"),
  event("9/18", "AC", "T1810/T1812/U1850 buffers", "3-1 AC 前处理", "工艺", "高", "IMG_1324"),
  event("9/18", "AC", "AC buffers / transfer rows", "2-1 AC C1", "工艺", "高", "IMG_1324"),
  event("9/18", "VIN", "B06/B07/AKTA/Column/Transfer Line", "2-2 VIN C1", "工艺", "中", "IMG_1324"),
  event("9/18", "VIN", "AKTA/Column/Transfer Line", "3-1 AC EQ / 2-1 AC C1/C2", "工艺", "中", "IMG_1324", "单元格跨列，照片中局部重叠"),
  event("9/19", "AC", "AC vessel/buffer rows", "3-1 AC C2/C3", "工艺", "高", "IMG_1324"),
  event("9/19", "AC", "AC vessel/buffer rows", "2-1 AC C4", "工艺", "高", "IMG_1324"),
  event("9/19", "VIN", "VIN rows", "3-2 VIN C2/C3 / 2-2 VIN C4", "工艺", "中", "IMG_1324"),
  event("9/20", "AC", "房间活动", "AC后房间整理", "物料/房间", "高", "IMG_1324"),
  event("9/20", "AC", "T1810", "4-3 CIP", "CIP", "高", "IMG_1324"),
  event("9/20", "AC", "T1812", "VIN pool", "工艺", "高", "IMG_1324"),
  event("9/20", "AC", "U1850 Transfer In / Transfer Out", "4-2 CIP", "CIP", "高", "IMG_1324"),
  event("9/20", "AC", "U1850 POU buffers", "4-4 CIP&SIP", "CIP/SIP", "高", "IMG_1324"),
  event("9/20", "AC", "Single Use B23/B06/B07", "Discard / Keep", "处置", "高", "IMG_1324"),
  event("9/20", "VIN", "Transfer Line", "4-3 CIP", "CIP", "高", "IMG_1324"),
  event("9/20", "CEX", "房间活动", "3-2 CEX/UFDF1物料准备", "物料/房间", "中", "IMG_1324"),
  event("9/20", "CEX", "CEX rows", "4-1 CEX", "工艺", "高", "IMG_1324"),
  event("9/20", "CEX", "Skid/Process", "3-2 CIP", "CIP", "中", "IMG_1324"),
  event("9/21", "CEX/UFDF1/AEX", "房间活动", "4-3 CEX/UFDF1使用后整理；4-4 AEX使用后整理；5-4房间清理", "物料/房间", "中", "IMG_1324/IMG_1325"),
  event("9/21", "UFDF1", "U1853 buffers / 30m2 UFDF", "4-2 UFDF1 EQ&UF / 1-1 UFDF1", "工艺", "高", "IMG_1324/IMG_1325"),
  event("9/21", "AEX", "AEX rows", "4-1 AEX C1 / 1-1 AEX C2", "工艺", "高", "IMG_1324/IMG_1325"),
  event("9/21", "CEX", "CEX rows", "4-3 CIP&SIP", "CIP/SIP", "高", "IMG_1324/IMG_1325"),
  event("9/22", "Room", "房间活动", "4-4 房间清理&物料传递", "物料/房间", "中", "IMG_1324/IMG_1325"),
  event("9/22", "AEX", "AEX rows", "4-2 CIP / 4-2 CIP&SIP / 4-3 CIP", "CIP/SIP", "高", "IMG_1324/IMG_1325"),
  event("9/22", "AEX", "AEX rows", "Discard", "处置", "高", "IMG_1324/IMG_1325"),
  event("9/22", "HA", "HA rows", "4-1 HA EQ / 1-1 HA", "工艺", "高", "IMG_1324/IMG_1325"),
  event("9/23", "AC/CEX/AEX/HA", "多区域", "5-4 CIP / 5-4 SIP / 5-5 CIP&SIP", "CIP/SIP", "中", "IMG_1324/IMG_1325"),
  event("9/23", "HA", "HA rows", "Discard / Keep", "处置", "高", "IMG_1324/IMG_1325"),
  event("9/23", "UFDF2", "房间活动", "4-4 房间放行&物料传递", "物料/房间", "高", "IMG_1325"),
  event("9/23", "UFDF2", "U1960 / Single Use / 15m2 UFDF", "4-1 UFDF2 EQ / 4-1 UFDF2 / 1-1 UFDF2后处理", "工艺", "高", "IMG_1324/IMG_1325"),
  event("9/24", "Room", "房间活动", "4-2 房间放行", "物料/房间", "高", "IMG_1324"),
  event("9/24", "AEX/HA", "AEX/HA rows", "4-2 SIP", "SIP", "高", "IMG_1324/IMG_1325"),
  event("9/24", "WF1", "WF1 line", "4-3 SIP", "SIP", "高", "IMG_1325"),
  event("9/25", "AC", "房间活动", "4-3 AC物料检查", "检查", "中", "IMG_1324"),
  event("9/25", "UFDF2", "UFDF2 rows", "4-2/4-3 VF；4-2 UFDF2工艺后整理；4-2 CIP&SIP", "工艺/CIP", "中", "IMG_1325"),
  event("9/25", "UFDF2", "UFDF2 rows", "4-1 UFDF2 EQ / 4-1 UFDF2 / 1-1 UFDF2后处理", "工艺", "高", "IMG_1325"),
  event("9/25", "UFDF3/Bulk Fill", "UFDF3 / Bulk Fill rows", "5-5 UFDF3物料准备；3-1/3-2 Bulk Fill", "物料/工艺", "中", "IMG_1325"),
  event("9/26", "AC", "房间活动", "3-2 logbook检查", "检查", "中", "IMG_1324"),
  event("9/26", "UFDF2", "房间活动", "3-2 房间清理", "物料/房间", "高", "IMG_1325"),
  event("9/26", "UFDF3", "UFDF3 rows", "4-2 Bulk Fill物料准备；4-2 UFD3 EQ；4-1 UFDF3；1-1 UFDF3后处理", "物料/工艺", "中", "IMG_1325"),
  event("9/26", "CIP Station", "CIP Station", "4-2 确认加碱", "确认", "中", "IMG_1325"),
  event("9/27", "AC", "AC rows", "3-1 AC前处理 / 2-1 AC C1", "工艺", "中", "IMG_1324"),
  event("9/27", "UFDF3", "房间活动 / UFDF3 rows", "3-3 房间清理；3-2 产品入库；3-3 CIP", "物料/房间/CIP", "中", "IMG_1325"),
  event("9/28", "AC", "下游排产表", "照片右侧仅局部可见，未做确定性整理", "待复核", "低", "IMG_1324/IMG_1325", "建议回源工作簿补校"),
  event("9/29", "AC", "下游排产表", "照片右侧仅局部可见，未做确定性整理", "待复核", "低", "IMG_1325", "建议回源工作簿补校"),
];

function unique(values) {
  return [...new Set(values.filter((value) => value !== "" && value !== null && value !== undefined))];
}

function parseGroupAssignments(activity) {
  const assignments = [];
  const clauses = String(activity)
    .split(/[；;]/)
    .map((part) => part.trim())
    .filter(Boolean);

  for (const clause of clauses) {
    const pieces = clause
      .split(/\s*\/\s*(?=\d+-\d+\s)/)
      .map((part) => part.trim())
      .filter(Boolean);

    for (const piece of pieces) {
      const prefixChain = piece.match(/^((?:\d+-\d+\s*\/\s*)+\d+-\d+)\s+(.+)$/);
      if (prefixChain) {
        const operation = prefixChain[2].trim();
        for (const prefix of prefixChain[1].split(/\s*\/\s*/)) {
          const match = prefix.match(/^(\d+)-(\d+)$/);
          if (!match) continue;
          assignments.push({
            prefix,
            totalGroups: Number(match[1]),
            groupNo: Number(match[2]),
            operation,
          });
        }
        continue;
      }

      const match = piece.match(/^(\d+)-(\d+)\s*(.+)?$/);
      if (match) {
        assignments.push({
          prefix: `${match[1]}-${match[2]}`,
          totalGroups: Number(match[1]),
          groupNo: Number(match[2]),
          operation: (match[3] ?? "").trim(),
        });
      }
    }
  }

  return assignments;
}

const groupAssignments = manualEvents.flatMap((item, eventIndex) => {
  return parseGroupAssignments(item.activity).map((assignment, assignmentIndex) => ({
    ...item,
    eventIndex: eventIndex + 1,
    assignmentIndex: assignmentIndex + 1,
    ...assignment,
    sharedGroupKey: `${item.date} | ${assignment.totalGroups}组-G${assignment.groupNo}`,
  }));
});

const groupAssignmentHeaders = [
  "日期",
  "Day",
  "共享组键",
  "总组数",
  "组号",
  "前缀",
  "模块",
  "资源/范围",
  "原活动/任务",
  "去前缀操作",
  "类型",
  "置信度",
  "来源",
  "备注",
];

const groupAssignmentRows = groupAssignments.map((assignment) => [
  assignment.date,
  assignment.day,
  assignment.sharedGroupKey,
  assignment.totalGroups,
  assignment.groupNo,
  assignment.prefix,
  assignment.module,
  assignment.scope,
  assignment.activity,
  assignment.operation,
  assignment.type,
  assignment.confidence,
  assignment.source,
  assignment.notes,
]);

const groupSummaryMap = new Map();
for (const assignment of groupAssignments) {
  const key = assignment.sharedGroupKey;
  if (!groupSummaryMap.has(key)) {
    groupSummaryMap.set(key, {
      date: assignment.date,
      day: assignment.day,
      sharedGroupKey: assignment.sharedGroupKey,
      totalGroups: assignment.totalGroups,
      groupNo: assignment.groupNo,
      modules: new Set(),
      operations: [],
      confidenceRanks: [],
    });
  }
  const row = groupSummaryMap.get(key);
  row.modules.add(assignment.module);
  row.operations.push(`${assignment.module} / ${assignment.scope}: ${assignment.operation || assignment.activity}`);
  row.confidenceRanks.push(confidenceRank(assignment.confidence));
}

const groupSummaryHeaders = ["日期", "Day", "共享组键", "总组数", "组号", "任务数", "涉及模块", "最低置信度", "任务清单"];
const groupSummaryRows = [...groupSummaryMap.values()]
  .sort((a, b) => {
    const dateOrder = dates.findIndex(([date]) => date === a.date) - dates.findIndex(([date]) => date === b.date);
    if (dateOrder !== 0) return dateOrder;
    if (a.totalGroups !== b.totalGroups) return a.totalGroups - b.totalGroups;
    return a.groupNo - b.groupNo;
  })
  .map((row) => {
    const minRank = Math.min(...row.confidenceRanks);
    const confidence = minRank === 3 ? "高" : minRank === 2 ? "中" : "低";
    return [
      row.date,
      row.day,
      row.sharedGroupKey,
      row.totalGroups,
      row.groupNo,
      row.operations.length,
      [...row.modules].join(", "),
      confidence,
      row.operations.join("\n"),
    ];
  });

const typeColors = {
  "工艺": "#92D050",
  "物料/工艺": "#92D050",
  "物料/房间": "#F4B183",
  "CIP": "#0070C0",
  "SIP": "#548235",
  "CIP/SIP": "#548235",
  "工艺/CIP": "#92D050",
  "检查": "#FFC000",
  "确认": "#00B0F0",
  "处置": "#70AD47",
  "待复核": "#D9EAD3",
};

function colName(n) {
  let s = "";
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function rangeFor(rows, cols) {
  return `A1:${colName(cols)}${rows}`;
}

function normalizeText(text) {
  return String(text)
    .replace(/U1\$50/g, "U1850")
    .replace(/U1S50/g, "U1850")
    .replace(/Dav/g, "Day")
    .replace(/UFDEL/g, "UFDF1")
    .replace(/UFDFL/g, "UFDF1")
    .replace(/\s+/g, " ")
    .trim();
}

function assignedDate(image, x) {
  const centers1324 = [
    [1120, "9/17"], [1510, "9/18"], [1910, "9/19"], [2290, "9/20"],
    [2670, "9/21"], [3070, "9/22"], [3460, "9/23"], [3830, "9/24"],
    [4210, "9/25"], [4570, "9/26"], [4970, "9/27"], [5350, "9/28"],
  ];
  const centers1325 = [
    [1120, "9/17"], [1535, "9/18"], [1930, "9/19"], [2310, "9/20"],
    [2840, "9/21"], [3220, "9/22"], [3510, "9/23"], [3840, "9/24"],
    [4210, "9/25"], [4570, "9/26"], [4860, "9/27"], [5260, "9/28"], [5530, "9/29"],
  ];
  const centers = image === "IMG_1325.png" ? centers1325 : centers1324;
  let best = centers[0];
  for (const center of centers) {
    if (Math.abs(center[0] - x) < Math.abs(best[0] - x)) best = center;
  }
  return best[1];
}

function approxRow(image, y) {
  if (image === "IMG_1325.png") return Math.round((y - 1320) / 41) + 35;
  return Math.round((y - 1219) / 41) + 4;
}

function confidenceRank(v) {
  return v === "高" ? 3 : v === "中" ? 2 : 1;
}

const ocr = JSON.parse(await fs.readFile(path.join(workDir, "ocr.json"), "utf8"));
const ocrRows = ocr
  .map((o) => ({ ...o, text: String(o.text ?? "").trim(), normalized: normalizeText(o.text ?? "") }))
  .filter((o) => o.text && o.y > 1060)
  .filter((o) => !/^(Day|9\/\d+|[A-Z]{1,3}$)$/.test(o.normalized) || /CIP|SIP|AC|AEX|CEX|UFDF|BH|U18|U19|11\.0|房间|物料|处理|检查|Discard|Keep|Transfer|Vessel|Buffer|Skid|Column|Line/.test(o.normalized))
  .map((o) => {
    const parsed = parseGroupAssignments(o.normalized)[0];
    return [
      o.image,
      Math.round(o.x),
      Math.round(o.y),
      Math.round(o.width),
      Math.round(o.height),
      Number(o.confidence.toFixed(2)),
      approxRow(o.image, o.y),
      assignedDate(o.image, o.x),
      o.text,
      o.normalized,
      parsed?.totalGroups ?? "",
      parsed?.groupNo ?? "",
      parsed?.operation ?? "",
    ];
  });

const eventHeaders = [
  "日期",
  "Day",
  "模块",
  "资源/范围",
  "活动/任务",
  "班组前缀",
  "涉及总组数",
  "涉及组号",
  "可解析操作数",
  "类型",
  "置信度",
  "来源",
  "备注",
];
const eventRows = manualEvents.map((e) => {
  const assignments = parseGroupAssignments(e.activity);
  return [
    e.date,
    e.day,
    e.module,
    e.scope,
    e.activity,
    unique(assignments.map((assignment) => assignment.prefix)).join("; "),
    unique(assignments.map((assignment) => assignment.totalGroups)).join("; "),
    unique(assignments.map((assignment) => `G${assignment.groupNo}`)).join("; "),
    assignments.length || "",
    e.type,
    e.confidence,
    e.source,
    e.notes,
  ];
});

const resourceHeaders = ["原表行号", "模块", "资源类型", "资源/设备", "编号/规格", "备注"];
const resourceRows = resources;

const summaryByDate = dates.map(([date, day]) => {
  const rows = manualEvents.filter((e) => e.date === date);
  const assignments = groupAssignments.filter((assignment) => assignment.date === date);
  const high = rows.filter((e) => e.confidence === "高").length;
  const mid = rows.filter((e) => e.confidence === "中").length;
  const low = rows.filter((e) => e.confidence === "低").length;
  const maxGroups = assignments.length ? Math.max(...assignments.map((assignment) => assignment.totalGroups)) : "";
  const activeSharedGroups = unique(assignments.map((assignment) => assignment.sharedGroupKey)).length || "";
  return [
    date,
    day,
    rows.length,
    maxGroups,
    activeSharedGroups,
    high,
    mid,
    low,
    unique(rows.map((e) => e.module)).join(", "),
  ];
});

const modules = [...new Set(manualEvents.map((e) => e.module.split("/")[0]))].sort();
const summaryByModule = modules.map((module) => [
  module,
  manualEvents.filter((e) => e.module.startsWith(module)).length,
  manualEvents.filter((e) => e.module.startsWith(module) && /CIP|SIP/.test(e.type)).length,
  manualEvents.filter((e) => e.module.startsWith(module) && /房间|物料/.test(e.type)).length,
]);

const matrixKeys = [...new Map(manualEvents.map((e) => [`${e.module} | ${e.scope}`, `${e.module} | ${e.scope}`])).values()];
const matrixHeaders = ["模块/资源范围", ...dates.map(([d, day]) => `${d}\n${day}`)];
const matrixRows = matrixKeys.map((key) => {
  const cells = dates.map(([date]) => manualEvents
    .filter((e) => `${e.module} | ${e.scope}` === key && e.date === date)
    .map((e) => e.activity)
    .join("\n"));
  return [key, ...cells];
});

const workbook = Workbook.create();

function addSheet(name, rows, headerColor = "#1F4E79") {
  const sheet = workbook.worksheets.add(name);
  const maxCols = Math.max(...rows.map((r) => r.length));
  const padded = rows.map((r) => [...r, ...Array(maxCols - r.length).fill("")]);
  sheet.getRange(rangeFor(padded.length, maxCols)).values = padded;
  sheet.getRange(`A1:${colName(maxCols)}1`).format = {
    fill: headerColor,
    font: { bold: true, color: "#FFFFFF" },
    horizontalAlignment: "center",
    verticalAlignment: "center",
    wrapText: true,
    borders: { preset: "outside", style: "thin", color: "#9CA3AF" },
  };
  sheet.getRange(rangeFor(padded.length, maxCols)).format = {
    wrapText: true,
    verticalAlignment: "top",
    borders: { preset: "inside", style: "thin", color: "#D1D5DB" },
  };
  sheet.getRange(rangeFor(padded.length, maxCols)).format.autofitColumns();
  return sheet;
}

const summaryRows = [
  ["下游排产表照片转 Excel", "", "", "", "", "", "", "", ""],
  ["输出说明", "基于 IMG_1324.HEIC 与 IMG_1325.HEIC 识别整理。照片为屏幕拍摄，存在透视、摩纹、遮挡，已用“置信度/备注”标记需复核项。", "", "", "", "", "", "", ""],
  ["班组前缀规则", "n-m 表示当天需要 n 个共享组，当前任务由第 m 组负责；同一天相同 n-m 的多个任务归为同一个共享组。", "", "", "", "", "", "", ""],
  ["源图片 1", "/Users/zhengfengyi/Downloads/IMG_1324.HEIC", "", "", "", "", "", "", ""],
  ["源图片 2", "/Users/zhengfengyi/Downloads/IMG_1325.HEIC", "", "", "", "", "", "", ""],
  ["整理事件数", manualEvents.length, "", "", "", "", "", "", ""],
  ["解析班组任务数", groupAssignments.length, "", "", "", "", "", "", ""],
  ["OCR 原始记录数", ocrRows.length, "", "", "", "", "", "", ""],
  ["", "", "", "", "", "", "", "", ""],
  ["按日期汇总", "", "", "", "", "", "", "", ""],
  ["日期", "Day", "整理事件数", "最大总组数", "活跃共享组数", "高置信", "中置信", "低置信", "涉及模块"],
  ...summaryByDate,
  ["", "", "", "", "", "", "", "", ""],
  ["按模块汇总", "", "", "", "", "", "", "", ""],
  ["模块", "整理事件数", "CIP/SIP相关", "房间/物料相关", "", "", "", "", ""],
  ...summaryByModule.map((r) => [...r, "", "", "", "", ""]),
];

const summary = addSheet("摘要", summaryRows, "#0F766E");
summary.getRange("A1:I1").format = { fill: "#0F766E", font: { bold: true, color: "#FFFFFF", size: 14 }, horizontalAlignment: "left" };
summary.getRange("A10:I10").format = { fill: "#B7DEE8", font: { bold: true }, horizontalAlignment: "left" };
summary.getRange(`A${13 + summaryByDate.length}:I${13 + summaryByDate.length}`).format = { fill: "#B7DEE8", font: { bold: true }, horizontalAlignment: "left" };

const detail = addSheet("事件明细_整理", [eventHeaders, ...eventRows]);
for (let r = 2; r <= eventRows.length + 1; r++) {
  const type = eventRows[r - 2][9];
  const color = typeColors[type] ?? "#E5E7EB";
  detail.getRange(`F${r}:I${r}`).format = { fill: "#EAF3F8", horizontalAlignment: "center", wrapText: true };
  detail.getRange(`J${r}`).format = { fill: color, font: { color: type === "CIP" ? "#FFFFFF" : "#000000" }, horizontalAlignment: "center" };
  const conf = eventRows[r - 2][10];
  detail.getRange(`K${r}`).format = {
    fill: conf === "高" ? "#D9EAD3" : conf === "中" ? "#FFF2CC" : "#F4CCCC",
    horizontalAlignment: "center",
  };
}

const groupDetail = addSheet("班组任务明细", [groupAssignmentHeaders, ...groupAssignmentRows], "#C65911");
for (let r = 2; r <= groupAssignmentRows.length + 1; r++) {
  const type = groupAssignmentRows[r - 2][10];
  const color = typeColors[type] ?? "#E5E7EB";
  groupDetail.getRange(`D${r}:F${r}`).format = { fill: "#FCE4D6", horizontalAlignment: "center" };
  groupDetail.getRange(`K${r}`).format = { fill: color, horizontalAlignment: "center", font: { color: type === "CIP" ? "#FFFFFF" : "#000000" } };
  const conf = groupAssignmentRows[r - 2][11];
  groupDetail.getRange(`L${r}`).format = {
    fill: conf === "高" ? "#D9EAD3" : conf === "中" ? "#FFF2CC" : "#F4CCCC",
    horizontalAlignment: "center",
  };
}

const groupSummary = addSheet("班组共享汇总", [groupSummaryHeaders, ...groupSummaryRows], "#9E480E");
for (let r = 2; r <= groupSummaryRows.length + 1; r++) {
  groupSummary.getRange(`D${r}:F${r}`).format = { fill: "#FCE4D6", horizontalAlignment: "center" };
  const conf = groupSummaryRows[r - 2][7];
  groupSummary.getRange(`H${r}`).format = {
    fill: conf === "高" ? "#D9EAD3" : conf === "中" ? "#FFF2CC" : "#F4CCCC",
    horizontalAlignment: "center",
  };
}

addSheet("资源清单", [resourceHeaders, ...resourceRows], "#5B9BD5");

const matrix = addSheet("矩阵视图_整理", [matrixHeaders, ...matrixRows], "#7030A0");
matrix.getRange(`B1:${colName(matrixHeaders.length)}1`).format = {
  fill: "#7030A0",
  font: { bold: true, color: "#FFFFFF" },
  wrapText: true,
  horizontalAlignment: "center",
};
for (let r = 2; r <= matrixRows.length + 1; r++) {
  for (let c = 2; c <= matrixHeaders.length; c++) {
    const value = matrixRows[r - 2][c - 1];
    if (!value) continue;
    const linked = manualEvents.find((e) => `${e.module} | ${e.scope}` === matrixRows[r - 2][0] && e.date === dates[c - 2][0]);
    const fill = typeColors[linked?.type] ?? "#D9EAD3";
    matrix.getRange(`${colName(c)}${r}`).format = {
      fill,
      wrapText: true,
      verticalAlignment: "top",
      borders: { preset: "outside", style: "thin", color: "#9CA3AF" },
      font: { color: linked?.type === "CIP" ? "#FFFFFF" : "#000000" },
    };
  }
}

addSheet("OCR原始记录", [[
  "来源图片",
  "x",
  "y",
  "宽",
  "高",
  "OCR置信度",
  "估算原表行",
  "估算日期",
  "OCR原文",
  "规范化文本",
  "解析总组数",
  "解析组号",
  "去前缀操作",
], ...ocrRows], "#8064A2");

await fs.mkdir(outputDir, { recursive: true });

const inspectDetail = await workbook.inspect({
  kind: "table",
  range: "事件明细_整理!A1:M20",
  include: "values",
  tableMaxRows: 20,
  tableMaxCols: 13,
});
console.log(inspectDetail.ndjson);

const inspectGroups = await workbook.inspect({
  kind: "table",
  range: "班组共享汇总!A1:I20",
  include: "values",
  tableMaxRows: 20,
  tableMaxCols: 9,
});
console.log(inspectGroups.ndjson);

const errors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 100 },
  summary: "final formula error scan",
});
console.log(errors.ndjson);

const renderDir = path.join(outputDir, "renders");
await fs.mkdir(renderDir, { recursive: true });
const renderTargets = [
  ["摘要", "A1:I28"],
  ["事件明细_整理", "A1:M30"],
  ["班组任务明细", "A1:N35"],
  ["班组共享汇总", "A1:I35"],
  ["资源清单", "A1:F35"],
  ["矩阵视图_整理", "A1:N25"],
  ["OCR原始记录", "A1:M35"],
];
for (const [sheetName, range] of renderTargets) {
  const blob = await workbook.render({ sheetName, range, format: "png", scale: 1.5 });
  const buffer = Buffer.from(await blob.arrayBuffer());
  await fs.writeFile(path.join(renderDir, `${sheetName}.png`), buffer);
}

const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputPath);
console.log(`Saved ${outputPath}`);
