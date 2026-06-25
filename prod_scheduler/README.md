# prod_scheduler — 排产引擎(Production Scheduler)

排产 ≠ 排班。这是把**批次/操作排到设备与时间上**的「排产」引擎,与 `solver_v4/`、`solver_v5/`
(人员**排班**)完全独立、独立端口。

- **端口**:5007(`PORT` / `PROD_SCHEDULER_PORT`)
- **v1 = 纯传播,无求解器**:STN + time-table,不引 CP-SAT(设计 D19 / C9)。
- **权威设计**:`docs/production_scheduling/{10,40,50}_*.md`

## 端点

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/prod/health` | 健康检查 |
| POST | `/api/prod/v1/cip-peak` | CIP 容量尖峰分析:并发扫描 + 逐站冲突(报增援候选) |

`cip-peak` 入参由后端 `ProdDataAssembler` 组装(已把每道 CIP 操作解析到它落的主站):

```json
{
  "default_capacity": 1,
  "day_hours": 24,
  "operations": [
    {"op_id": "o1", "station_code": "CIP-S1", "start_hour": 120, "duration_hours": 5,
     "equipment_code": "PT1810", "pipeline_code": "M1"}
  ]
}
```

出参:`overall`(全站汇总并发峰值 + 逐日峰值,对标 WBP2486 Day5=16)、`stations`(逐站峰值)、
`conflicts`(并发 > 容量的段 = 报增援候选)。

## 跑

```bash
cd prod_scheduler
python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt
python3 app.py                                   # 开发,端口 5007
python3 -m unittest tests.test_timetable          # 单测(对标已知答案,含复刻 Day5=16)
```
