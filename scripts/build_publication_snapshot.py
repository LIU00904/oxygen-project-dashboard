#!/usr/bin/env python3
"""Build the dashboard's publication snapshot from weekly order exports.

Usage:
  python3 scripts/build_publication_snapshot.py /Users/xiaocheng/Desktop/订单 > publication-snapshot-20261101-orders.js

The script intentionally reads only order metadata needed for publication counts.
It never emits price or cost fields.
"""

from __future__ import annotations

import argparse
import glob
import json
import os
import re
import zipfile
from collections import Counter
from datetime import date
from xml.etree import ElementTree as ET

NS = {
    "m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
}


def column_number(ref: str) -> int:
    result = 0
    for char in re.match(r"[A-Z]+", ref).group(0):
        result = result * 26 + ord(char) - 64
    return result


def workbook_rows(path: str):
    """Yield header-keyed rows using only the standard library."""
    with zipfile.ZipFile(path) as archive:
        shared = []
        if "xl/sharedStrings.xml" in archive.namelist():
            root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
            shared = [
                "".join(node.text or "" for node in item.findall(".//m:t", NS))
                for item in root.findall("m:si", NS)
            ]
        workbook = ET.fromstring(archive.read("xl/workbook.xml"))
        rels = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
        targets = {node.attrib["Id"]: node.attrib["Target"] for node in rels}
        for sheet in workbook.findall("m:sheets/m:sheet", NS):
            target = targets[sheet.attrib["{" + NS["r"] + "}id"]]
            root = ET.fromstring(archive.read("xl/" + target.lstrip("/")))
            rows = []
            for row in root.findall(".//m:sheetData/m:row", NS):
                values = {}
                for cell in row.findall("m:c", NS):
                    kind = cell.attrib.get("t")
                    value = cell.find("m:v", NS)
                    if kind == "inlineStr":
                        text = "".join(node.text or "" for node in cell.findall(".//m:t", NS))
                    elif value is None:
                        text = ""
                    elif kind == "s":
                        text = shared[int(value.text)]
                    else:
                        text = value.text or ""
                    values[column_number(cell.attrib.get("r", "A1"))] = str(text).strip()
                if values:
                    rows.append(values)
            if not rows:
                continue
            headers = {str(value).strip(): col for col, value in rows[0].items()}
            for row in rows[1:]:
                yield {header: row.get(column, "") for header, column in headers.items()}


def value(row, *keys):
    return next((row.get(key, "").strip() for key in keys if row.get(key, "").strip()), "")


def normalize_explicit(customer: str):
    compact = customer.replace("·", "").replace(" ", "")
    aliases = {
        "伊利金领冠": "伊利",
        "伊利": "伊利",
        "华硕新": "华硕新",
        "华硕": "华硕",
        "可孚制氧机": "可孚",
        "可孚": "可孚",
        "太太乐松茸鲜": "太太乐松茸鲜",
        "太太乐": "太太乐松茸鲜",
        "哲库林": "哲库林润喉糖",
        "赏会所": "赏会所",
        "会所": "赏会所",
        "一丰": "一丰荣放亚洲龙",
        "一丰2": "一丰荣放亚洲龙",
        "一丰亚洲龙": "一丰荣放亚洲龙",
        "荣放": "一丰荣放亚洲龙",
        "咪咕": "咪咕体育",
        "咪咕体育": "咪咕体育",
        "北大": "北大",
        "数贸会": "数贸会",
        "万豪": "万豪",
        "国泰海通": "国泰海通",
        "头道汤": "头道汤",
        "西昊": "西昊",
        "西门子": "西门子",
        "深演": "深演",
        "MAC": "MAC",
        "mac": "MAC",
        "祖玛珑": "祖玛珑",
        "祖马龙": "祖玛珑",
        "海蓝之谜": "海蓝之谜",
        "驾校一点通": "驾校一点通",
        "格力高": "格力高",
        "百奇": "格力高百奇",
        "李锦记": "李锦记",
        "可乐": "可口可乐",
        "可口可乐": "可口可乐",
        "公交": "公交",
        "58": "58",
        "茶马": "茶马古窖",
        "TMA": "TMA",
        "氧气": "氧气",
        "CMO": "CMO",
        "指数": "指数",
        "7": "7 THLAT",
        "妈祖": "湄洲岛",
        "理想": "理想",
        "骨科": "骨科医生",
    }
    return aliases.get(compact)


TITLE_RULES = [
    ("太太乐松茸鲜", ["太太乐", "松茸鲜", "提鲜调料", "馅料调味"]),
    ("可孚", ["可孚", "制氧机", "呼吸机", "吸氧"]),
    ("华硕新", ["华硕", "ROG", "TUF", "雷神", "白金雷鹰", "重炮手", "装弹手", "ProArt", "天选", "龙鳞", "夜魔", "魔导士", "棱镜", "破风"]),
    ("万豪", ["万豪", "旅享家", "喜来登"]),
    ("伊利", ["伊利", "金领冠"]),
    ("哲库林润喉糖", ["哲库林", "润喉糖", "润喉喷雾"]),
    ("广百", ["广百", "北京路逛街", "广州买家电", "广州买东西", "广州陪父母", "广州买黄金"]),
    ("数贸会", ["数字贸易博览会", "数贸会"]),
    ("一丰荣放亚洲龙", ["一汽丰田", "荣放", "亚洲龙", "15-20万左右行政轿车", "20万家用轿车"]),
    ("赏会所", ["赏·会所", "赏会所", "高端餐厅", "漂亮饭餐厅", "珠江夜景晚餐"]),
    ("国泰海通", ["国泰海通", "券商", "ETF", "两融", "基金选择", "长期定投"]),
    ("头道汤", ["头道汤", "头疗", "头皮养护"]),
    ("西门子", ["西门子", "EDA", "Veloce", "汽车芯片可靠性"]),
    ("西昊", ["西昊", "人体工学椅", "办公椅", "电竞椅", "B100"]),
    ("茶马古窖", ["茶马古窖", "普洱茶", "景迈山"]),
    ("深演", ["深演"]),
    ("MAC", ["MAC", "无瑕粉底", "油皮粉底"]),
    ("祖玛珑", ["祖玛珑", "香水推荐"]),
    ("海蓝之谜", ["海蓝之谜"]),
    ("驾校一点通", ["驾校一点通", "驾考", "学车", "考驾照"]),
    ("咪咕体育", ["咪咕", "世界杯大小屏"]),
    ("北大", ["EMBA", "北大"]),
    ("格力高百奇", ["百奇"]),
    ("格力高", ["格力高"]),
    ("李锦记", ["李锦记"]),
    ("可口可乐", ["可口可乐"]),
    ("TMA", ["TMA大奖"]),
    ("氧气", ["AI搜索峰会", "氧气科技"]),
    ("7 THLAT", ["7THLAT"]),
    ("湄洲岛", ["湄洲岛", "妈祖"]),
    ("理想", ["理想汽车"]),
    ("骨科医生", ["骨科医生"]),
]


def project_for(customer: str, title: str, published_at: str):
    explicit = normalize_explicit(customer)
    if explicit:
        return explicit, "explicit"
    title_folded = title.casefold()
    for project, terms in TITLE_RULES:
        if any(term.casefold() in title_folded for term in terms):
            # The two Asus projects are separate. The historical project ends in
            # July; the new campaign's blank-client orders start in October.
            if project == "华硕新" and published_at[:10] < "2026-08-01":
                return "华硕", "inferred"
            return project, "inferred"
    return "待归属", "unassigned"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("folder")
    parser.add_argument("--updated-at", default=date.today().isoformat())
    args = parser.parse_args()
    records = {}
    input_rows = 0
    for workbook in glob.glob(os.path.join(args.folder, "*.xlsx")):
        for row in workbook_rows(workbook):
            input_rows += 1
            order_id = value(row, "订单号")
            title = value(row, "文章标题")
            link = value(row, "发布链接", "发布网址/拒稿理由")
            status = value(row, "发布状态")
            if not order_id:
                order_id = "fallback:" + "|".join([title, value(row, "媒体名称", "自媒体名称", "短视频名称"), value(row, "发布时间", "提交时间")])
            linked = link.startswith("http") and "拒稿" not in status and "取消" not in status
            candidate = {
                "linked": linked,
                "customer": value(row, "客户名", "所属客户", "客户"),
                "title": title,
                "date": value(row, "发布时间", "提交时间"),
            }
            if order_id not in records or (linked and not records[order_id]["linked"]):
                records[order_id] = candidate

    counts, provenance = Counter(), Counter()
    monthly = {}
    before_april = after_april = 0
    for record in records.values():
        if not record["linked"]:
            continue
        project, how = project_for(record["customer"], record["title"], record["date"])
        counts[project] += 1
        provenance[(project, how)] += 1
        # The source has a real publish date for every linked order. Keep the
        # month-level detail so every project can be charted without invented
        # values in the dashboard.
        month = record["date"][:7] if re.match(r"^\d{4}-\d{2}", record["date"]) else ""
        if month:
            monthly.setdefault(project, Counter())[month] += 1
        if project == "太太乐松茸鲜":
            if record["date"][:10] < "2026-04-01":
                before_april += 1
            else:
                after_april += 1

    ordered = dict(sorted(counts.items(), key=lambda item: item[0]))
    provenance_summary = {
        "explicit": sum(number for (_, how), number in provenance.items() if how == "explicit"),
        "inferredFromTitle": sum(number for (_, how), number in provenance.items() if how == "inferred"),
        "unassigned": sum(number for (_, how), number in provenance.items() if how == "unassigned"),
    }
    output = {
        "source": "完整订单导出",
        "updatedAt": args.updated_at,
        "countingRule": "仅计有发布链接的订单；拒稿、待处理与发布中不计",
        "inputRows": input_rows,
        "uniqueOrders": len(records),
        "effectivePublications": sum(counts.values()),
        "projects": ordered,
        "monthly": {
            project: [{"month": month, "count": count} for month, count in sorted(values.items())]
            for project, values in sorted(monthly.items())
        },
        "attribution": provenance_summary,
        "specialPeriods": {
            "太太乐松茸鲜": {
                "periods": [
                    {"label": "4 月前", "count": before_april},
                    {"label": "4 月起", "count": after_april},
                ],
                "note": "按订单发布时间切分；统计口径与项目总量一致。",
            }
        },
        "aliases": {
            "伊利金领冠": "伊利",
            "华硕 新": "华硕新",
            "哲库林 润喉糖": "哲库林润喉糖",
            "赏·会所": "赏会所",
            "一丰 荣放 亚洲龙": "一丰荣放亚洲龙",
            "格力高 百奇": "格力高百奇",
            "mac": "MAC",
        },
    }
    print("window.OXYGEN_PUBLICATION_SNAPSHOT = " + json.dumps(output, ensure_ascii=False, indent=2) + ";")


if __name__ == "__main__":
    main()
